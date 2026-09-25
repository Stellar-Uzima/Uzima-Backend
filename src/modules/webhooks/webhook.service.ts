import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LessThanOrEqual, Repository } from 'typeorm';
import { WebhookEvent, WebhookEventStatus } from './entities/webhook-event.entity';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEvent) private readonly events: Repository<WebhookEvent>,
    private readonly config: ConfigService,
    private readonly emitter: EventEmitter2,
  ) {}

  async receive(rawBody: Buffer, signature: string, payload: Record<string, unknown>) {
    this.verifySignature(rawBody, signature);
    const eventId = this.eventId(payload);
    const eventType = String(payload.type || payload.event || 'unknown');
    const existing = await this.events.findOne({ where: { provider: 'stellar', eventId } });
    if (existing) return { accepted: true, duplicate: true, eventId: existing.eventId };

    const event = await this.events.save(this.events.create({
      provider: 'stellar', eventId, eventType, payload,
      status: WebhookEventStatus.RECEIVED, attemptCount: 0,
    }));
    await this.process(event);
    return { accepted: true, duplicate: false, eventId: event.eventId };
  }

  async retryDue(): Promise<number> {
    const due = await this.events.find({
      where: { status: WebhookEventStatus.RETRYING, nextAttemptAt: LessThanOrEqual(new Date()) },
      take: 100,
    });
    for (const event of due) await this.process(event);
    return due.length;
  }

  private async process(event: WebhookEvent): Promise<void> {
    try {
      event.attemptCount += 1;
      await this.events.save(event);
      await this.emitter.emitAsync(`webhook.${event.eventType}`, event.payload);
      event.status = WebhookEventStatus.PROCESSED;
      event.lastError = null;
      event.nextAttemptAt = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      event.lastError = message;
      if (event.attemptCount >= this.config.get<number>('WEBHOOK_MAX_ATTEMPTS', 5)) {
        event.status = WebhookEventStatus.FAILED;
        this.logger.error(`Webhook ${event.eventId} permanently failed: ${message}`);
      } else {
        event.status = WebhookEventStatus.RETRYING;
        const delay = Math.min(3600000, 1000 * 2 ** event.attemptCount);
        event.nextAttemptAt = new Date(Date.now() + delay);
      }
    }
    await this.events.save(event);
  }

  private verifySignature(rawBody: Buffer, signature: string): void {
    const secret = this.config.get<string>('STELLAR_WEBHOOK_SECRET');
    if (!secret || !signature) throw new UnauthorizedException('Invalid webhook signature');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (provided.length !== expectedBuffer.length || !crypto.timingSafeEqual(provided, expectedBuffer)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private eventId(payload: Record<string, unknown>): string {
    const supplied = payload.id || payload.eventId || payload.event_id;
    if (supplied) return String(supplied);
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
