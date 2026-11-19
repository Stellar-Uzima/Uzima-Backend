import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { EmailProviderEvent } from './entities/email-provider-event.entity';
import { InAppNotification } from './entities/in-app-notification.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';

export interface EmailProviderEventResult {
  accepted: true;
  duplicate: boolean;
  eventId: string;
  eventType: string;
  notificationId: string | null;
}

export interface EmailProviderCallbackResult {
  accepted: true;
  results: EmailProviderEventResult[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Records email provider acceptance and delivery callbacks.
 *
 * Callbacks are authenticated with an HMAC-SHA256 signature over the raw
 * request body, correlated to the originating notification through provider
 * metadata, and made idempotent by a unique `(provider, providerEventId)`
 * index.
 */
@Injectable()
export class EmailProviderWebhookService {
  private readonly logger = new Logger(EmailProviderWebhookService.name);
  private readonly provider = 'email';

  constructor(
    @InjectRepository(EmailProviderEvent)
    private readonly events: Repository<EmailProviderEvent>,
    @InjectRepository(InAppNotification)
    private readonly notifications: Repository<InAppNotification>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryLogs: Repository<NotificationDeliveryLog>,
    private readonly config: ConfigService
  ) {}

  /**
   * Authenticates and records one callback. A callback may carry a single
   * event object or an array of event objects (some providers batch them).
   */
  async handle(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined,
    body: unknown
  ): Promise<EmailProviderCallbackResult> {
    this.verifySignature(rawBody, signature, timestamp);

    const payloads = Array.isArray(body) ? body : [body];
    const results: EmailProviderEventResult[] = [];

    for (const payload of payloads) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        continue;
      }
      results.push(await this.record(payload as Record<string, unknown>));
    }

    return { accepted: true, results };
  }

  /**
   * Verifies the provider signature with a constant-time comparison and, when
   * the provider supplies a signed timestamp, rejects stale callbacks.
   */
  verifySignature(rawBody: Buffer, signature: string | undefined, timestamp?: string): void {
    const secret = this.config.get<string>('EMAIL_PROVIDER_WEBHOOK_SECRET');
    if (!secret || !signature) {
      throw new UnauthorizedException('Invalid email provider signature');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const providedHex = signature.trim().replace(/^sha256=/i, '');
    const provided = /^[0-9a-f]+$/i.test(providedHex)
      ? Buffer.from(providedHex, 'hex')
      : Buffer.alloc(0);

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid email provider signature');
    }

    this.assertFreshTimestamp(timestamp);
  }

  private assertFreshTimestamp(timestamp?: string): void {
    if (timestamp === undefined || timestamp === null || timestamp === '') {
      return;
    }

    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds)) {
      throw new UnauthorizedException('Invalid email provider signature timestamp');
    }

    const toleranceSeconds =
      this.config.get<number>('EMAIL_PROVIDER_WEBHOOK_TOLERANCE_SECONDS', 300) ?? 300;
    const ageSeconds = Math.abs(Date.now() / 1000 - seconds);
    if (ageSeconds > toleranceSeconds) {
      throw new UnauthorizedException('Expired email provider signature timestamp');
    }
  }

  private async record(payload: Record<string, unknown>): Promise<EmailProviderEventResult> {
    const providerEventId = this.eventId(payload);

    const existing = await this.events.findOne({
      where: { provider: this.provider, providerEventId },
    });
    if (existing) {
      return {
        accepted: true,
        duplicate: true,
        eventId: existing.providerEventId,
        eventType: existing.eventType,
        notificationId: existing.notificationId,
      };
    }

    const eventType = this.eventType(payload);
    const correlation = await this.correlate(payload);
    const event = this.events.create({
      provider: this.provider,
      providerEventId,
      eventType,
      providerMessageId: this.messageId(payload),
      notificationId: correlation.notificationId,
      deliveryLogId: correlation.deliveryLogId,
      recipient: this.recipient(payload),
      occurredAt: this.occurredAt(payload),
      payload,
    });

    try {
      await this.events.save(event);
    } catch (error) {
      // A concurrent delivery of the same callback can lose the race between
      // the lookup above and the insert; the unique index keeps it idempotent.
      if (this.isUniqueViolation(error)) {
        return {
          accepted: true,
          duplicate: true,
          eventId: providerEventId,
          eventType,
          notificationId: correlation.notificationId,
        };
      }
      throw error;
    }

    this.logger.log(
      `Email provider event recorded: id=${providerEventId} type=${eventType} notification=${correlation.notificationId ?? 'unlinked'}`
    );

    return {
      accepted: true,
      duplicate: false,
      eventId: providerEventId,
      eventType,
      notificationId: correlation.notificationId,
    };
  }

  /**
   * Resolves the originating notification from the delivery-log identifier the
   * provider echoed, or from the notification identifier in its metadata.
   * Unknown or malformed identifiers leave the event unlinked instead of
   * failing the callback.
   */
  private async correlate(
    payload: Record<string, unknown>
  ): Promise<{ notificationId: string | null; deliveryLogId: string | null }> {
    const deliveryLogId = this.uuid(
      this.first(
        payload,
        'deliveryLogId',
        'delivery_log_id',
        'metadata.deliveryLogId',
        'metadata.delivery_log_id',
        'data.metadata.deliveryLogId',
        'data.metadata.delivery_log_id'
      )
    );
    if (deliveryLogId) {
      const log = await this.deliveryLogs.findOne({ where: { id: deliveryLogId } });
      if (log) {
        return { notificationId: log.notificationId, deliveryLogId: log.id };
      }
    }

    const notificationId = this.uuid(
      this.first(
        payload,
        'notificationId',
        'notification_id',
        'metadata.notificationId',
        'metadata.notification_id',
        'data.notificationId',
        'data.metadata.notificationId',
        'data.metadata.notification_id',
        'custom_args.notification_id',
        'custom_args.notificationId'
      )
    );
    if (notificationId) {
      const notification = await this.notifications.findOne({
        where: { id: notificationId },
        select: ['id'],
      });
      if (notification) {
        return { notificationId, deliveryLogId: null };
      }
    }

    return { notificationId: null, deliveryLogId: null };
  }

  private eventId(payload: Record<string, unknown>): string {
    const supplied = this.first(
      payload,
      'id',
      'eventId',
      'event_id',
      'providerEventId',
      'provider_event_id',
      'sg_event_id',
      'event-data.id'
    );
    const scalar = this.scalar(supplied);
    if (scalar !== null) {
      return String(scalar).slice(0, 255);
    }
    // Identical payloads without an id are still deduplicated by content.
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private eventType(payload: Record<string, unknown>): string {
    const raw = this.first(
      payload,
      'type',
      'event',
      'eventType',
      'event_type',
      'recordType',
      'RecordType'
    );
    const value = typeof raw === 'string' ? raw.toLowerCase() : '';

    if (/deliver/.test(value)) return 'delivered';
    if (/accept|processed/.test(value)) return 'accepted';
    if (/bounce/.test(value)) return 'bounced';
    if (/complain|spam/.test(value)) return 'complained';
    if (/defer/.test(value)) return 'deferred';
    if (/drop/.test(value)) return 'dropped';

    return value ? value.slice(0, 50) : 'unknown';
  }

  private messageId(payload: Record<string, unknown>): string | null {
    const value = this.first(
      payload,
      'messageId',
      'message_id',
      'providerMessageId',
      'provider_message_id',
      'sg_message_id',
      'data.email_id',
      'mail.messageId',
      'MessageID',
      'event-data.message.headers.message-id'
    );
    const scalar = this.scalar(value);
    if (scalar === null) return null;
    return String(scalar).replace(/^<|>$/g, '').slice(0, 255);
  }

  private recipient(payload: Record<string, unknown>): string | null {
    const value = this.first(
      payload,
      'email',
      'recipient',
      'to',
      'data.to',
      'mail.destination',
      'event-data.recipient'
    );
    const address = this.scalar(value);
    return address === null || address === '' ? null : String(address).slice(0, 320);
  }

  private occurredAt(payload: Record<string, unknown>): Date | null {
    const value = this.first(
      payload,
      'timestamp',
      'occurredAt',
      'occurred_at',
      'created_at',
      'Date',
      'event-data.timestamp'
    );
    const scalar = this.scalar(value);
    if (scalar === null || scalar === '') return null;

    let date: Date;
    if (typeof scalar === 'number' || /^\d+$/.test(scalar)) {
      const numeric = Number(scalar);
      // Providers use seconds or milliseconds; anything below 1e12 is seconds.
      date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    } else {
      date = new Date(scalar);
    }

    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** Returns a string/number leaf, unwrapping provider arrays of recipients. */
  private scalar(value: unknown): string | number | null {
    const raw: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
    return typeof raw === 'string' || typeof raw === 'number' ? raw : null;
  }

  private first(payload: Record<string, unknown>, ...paths: string[]): unknown {
    for (const path of paths) {
      const value = path.split('.').reduce<unknown>((current, key) => {
        if (current && typeof current === 'object') {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, payload);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  private uuid(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return UUID_PATTERN.test(value) ? value : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: string; driverError?: { code?: string } }).code;
    const driverCode = (error as { driverError?: { code?: string } }).driverError?.code;
    return code === '23505' || driverCode === '23505';
  }
}
