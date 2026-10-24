import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../entities/user.entity';
import {
  NotificationDeliveryLog,
  DeliveryStatus,
} from './entities/notification-delivery-log.entity';
import {
  InAppNotification,
  DeliveryChannel,
  NotificationTypeEnum,
} from './entities/in-app-notification.entity';
import { SmsService } from '../../shared/sms/sms.service';
import { PushNotificationService } from '../../shared/notifications/services/push-notification.service';
import { EmailTemplateService } from '../../shared/notifications/services/email-template.service';
import { MetricsService } from '../../shared/metrics/metrics.service';
import { isPermanentProviderError } from './provider-error-classifier';
import {
  NOTIFICATION_CENTER_QUEUE,
  RETRY_DELIVERY_JOB,
} from './constants/notification-center.constants';

export interface ChannelDispatchContext {
  notification: InAppNotification;
  user: User;
  preferences: NotificationPreference | null;
}

export interface RetryJobData {
  notificationId: string;
  logId: string;
  channel: DeliveryChannel;
  userId: string;
  title: string;
  body: string;
  attempt: number;
}

@Injectable()
export class ChannelRouterService {
  private readonly logger = new Logger(ChannelRouterService.name);
  private readonly circuitFailures = new Map<DeliveryChannel, number>();
  private readonly circuitOpenedAt = new Map<DeliveryChannel, number>();
  private readonly circuitProbeInFlight = new Set<DeliveryChannel>();

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryLogRepo: Repository<NotificationDeliveryLog>,
    @InjectQueue(NOTIFICATION_CENTER_QUEUE)
    private readonly retryQueue: Queue<RetryJobData>,
    private readonly smsService: SmsService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly emailTemplateService: EmailTemplateService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Helper method to check if a channel is enabled for a notification type
   * Uses granular preferences if available, falls back to global settings
   */
  private isChannelEnabled(
    preferences: NotificationPreference | null,
    notificationType: NotificationTypeEnum,
    channel: 'email' | 'push' | 'sms',
  ): boolean {
    if (!preferences) return true;

    // Check granular preference first
    const typePrefs = preferences.channelPreferences?.[notificationType];
    if (typePrefs && typePrefs[channel] !== undefined) {
      return typePrefs[channel];
    }

    // Fallback to global channel settings
    switch (channel) {
      case 'email':
        return preferences.emailNotifications ?? true;
      case 'push':
        return preferences.pushNotifications ?? true;
      case 'sms':
        return preferences.smsNotifications ?? true;
      default:
        return true;
    }
  }

  /**
   * Routes a notification to all channels enabled in the user's preferences.
   * In-app is always delivered (done by the caller). This method handles
   * email, push, and SMS, logging each attempt.
   */
  async route(ctx: ChannelDispatchContext): Promise<void> {
    const { notification, user, preferences } = ctx;

    const channelHandlers: Array<{
      channel: DeliveryChannel;
      enabled: boolean;
      send: () => Promise<void>;
    }> = [
      {
        channel: DeliveryChannel.EMAIL,
        enabled: this.isChannelEnabled(preferences, notification.type, 'email'),
        send: () => this.dispatchEmail(user, notification),
      },
      {
        channel: DeliveryChannel.PUSH,
        enabled: this.isChannelEnabled(preferences, notification.type, 'push'),
        send: () => this.dispatchPush(user, notification),
      },
      {
        channel: DeliveryChannel.SMS,
        enabled: this.isChannelEnabled(preferences, notification.type, 'sms'),
        send: () => this.dispatchSms(user, notification),
      },
    ];

    await Promise.allSettled(
      channelHandlers
        .filter((h) => h.enabled)
        .map((h) => this.attemptDelivery(h.channel, h.send, notification, user, 1)),
    );
  }

  /**
   * Retries a previously failed delivery (called by the queue processor).
   *
   * Terminal behavior is driven by the notification retry policy:
   * - Transient failure: exponential backoff via the retry queue.
   * - Permanent failure: log FAILED immediately, no retry enqueued, counter
   *   incremented for observability.
   */
  async retryDelivery(data: RetryJobData): Promise<void> {
    const { notificationId, logId, channel, userId, title, body, attempt } = data;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`Retry skipped — user ${userId} not found`);
      await this.updateLog(logId, DeliveryStatus.FAILED, attempt, 'User not found');
      return;
    }

    const notification = { id: notificationId, userId, title, body } as InAppNotification;
    const sendFn: () => Promise<void> = this.buildSendFn(channel, user, notification);

    try {
      this.acquireProvider(channel);
      await sendFn();
      this.recordProviderSuccess(channel);
      await this.updateLog(logId, DeliveryStatus.SENT, attempt, null);
      await this.markChannelDelivered(notificationId, channel);
    } catch (err: any) {
      await this.handleDeliveryFailure(err, {
        logId,
        notificationId,
        channel,
        attempt,
        userId,
        title,
        body,
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  private async attemptDelivery(
    channel: DeliveryChannel,
    send: () => Promise<void>,
    notification: InAppNotification,
    user: User,
    attempt: number,
  ): Promise<void> {
    const log = await this.createLog(notification.id, channel);

    try {
      this.acquireProvider(channel);
      await send();
      this.recordProviderSuccess(channel);
      await this.updateLog(log.id, DeliveryStatus.SENT, attempt, null);
      await this.markChannelDelivered(notification.id, channel);
    } catch (err: any) {
      await this.handleDeliveryFailure(err, {
        logId: log.id,
        notificationId: notification.id,
        channel,
        attempt,
        userId: user.id,
        title: notification.title,
        body: notification.body,
      });
    }
  }

  /**
   * Single failure-handling path used by both initial dispatch and retry.
   *
   * Decision tree:
   * 1. Permanent provider error → FAILED immediately, observable via metrics.
   * 2. Circuit open → re-queue with circuit-reset delay (retryable).
   * 3. Transient + attempts exhausted → FAILED per terminal strategy.
   * 4. Transient + attempts remaining → re-queue with exponential backoff.
   */
  private async handleDeliveryFailure(
    err: any,
    ctx: {
      logId: string;
      notificationId: string;
      channel: DeliveryChannel;
      attempt: number;
      userId: string;
      title: string;
      body: string;
    },
  ): Promise<void> {
    const errorMessage: string = err?.message ?? String(err);

    // 1. Permanent failure — deterministic, never succeeds on the same input.
    if (isPermanentProviderError(err)) {
      await this.updateLog(ctx.logId, DeliveryStatus.FAILED, ctx.attempt, errorMessage);
      this.metrics?.recordPermanentProviderFailure(ctx.channel);
      this.logger.error(
        `PERMANENT provider failure for notification ${ctx.notificationId} channel ${ctx.channel}: ${errorMessage} — not retrying`,
      );
      return;
    }

    // 2. Circuit breaker signal — retry after cooldown.
    if (err?.code === 'NOTIFICATION_CIRCUIT_OPEN') {
      this.metrics?.recordNotificationDelivery(ctx.channel, 'circuit_open');
      await this.updateLog(ctx.logId, DeliveryStatus.PENDING, ctx.attempt, errorMessage);
      await this.retryQueue.add(
        RETRY_DELIVERY_JOB,
        {
          notificationId: ctx.notificationId,
          logId: ctx.logId,
          channel: ctx.channel,
          userId: ctx.userId,
          title: ctx.title,
          body: ctx.body,
          attempt: ctx.attempt,
        },
        {
          delay: this.getCircuitResetMs(),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
      this.metrics?.incrementNotificationDeliveryRetries(ctx.channel);
      this.logger.warn(
        `Circuit open for channel ${ctx.channel}; re-queueing notification ${ctx.notificationId}`,
      );
      return;
    }

    // Record transient provider failure for circuit tracking.
    this.recordProviderFailure(ctx.channel);
    this.metrics?.recordNotificationDelivery(ctx.channel, 'failure');
    const maxAttempts = this.getMaxAttempts();

    // 3. Terminal: attempts exhausted on a transient failure.
    if (ctx.attempt >= maxAttempts) {
      await this.updateLog(ctx.logId, DeliveryStatus.FAILED, ctx.attempt, errorMessage);
      this.metrics?.recordTerminalDeliveryFailure(ctx.channel);
      if (this.getTerminalStrategy() === 'escalate') {
        this.logger.error(
          `Notification ${ctx.notificationId} channel ${ctx.channel} permanently failed after ${maxAttempts} attempts: ${errorMessage}`,
        );
      }
      return;
    }

    // 4. Retry with exponential backoff.
    await this.updateLog(ctx.logId, DeliveryStatus.PENDING, ctx.attempt, errorMessage);
    const delay = this.getRetryDelayMs(ctx.attempt);
    await this.retryQueue.add(
      RETRY_DELIVERY_JOB,
      {
        notificationId: ctx.notificationId,
        logId: ctx.logId,
        channel: ctx.channel,
        userId: ctx.userId,
        title: ctx.title,
        body: ctx.body,
        attempt: ctx.attempt + 1,
      },
      {
        delay,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.metrics?.incrementNotificationDeliveryRetries(ctx.channel);
    this.logger.warn(
      `Delivery attempt ${ctx.attempt}/${maxAttempts} failed for notification ${ctx.notificationId} channel ${ctx.channel}: ${errorMessage} — retrying in ${delay}ms`,
    );
  }

  private acquireProvider(channel: DeliveryChannel): void {
    const resetMs = this.getCircuitResetMs();
    const openedAt = this.circuitOpenedAt.get(channel);
    if (openedAt === undefined) return;
    if (Date.now() - openedAt < resetMs || this.circuitProbeInFlight.has(channel)) {
      throw Object.assign(new Error(`Notification provider circuit is open for ${channel}`), {
        code: 'NOTIFICATION_CIRCUIT_OPEN',
      });
    }
    this.circuitProbeInFlight.add(channel);
    this.logger.warn(
      `Notification provider circuit allowing recovery probe for channel ${channel}`,
    );
  }

  private recordProviderSuccess(channel: DeliveryChannel): void {
    this.circuitFailures.delete(channel);
    this.circuitOpenedAt.delete(channel);
    this.circuitProbeInFlight.delete(channel);
    this.metrics?.setNotificationCircuitOpen(channel, false);
    this.metrics?.recordNotificationDelivery(channel, 'success');
  }

  private recordProviderFailure(channel: DeliveryChannel): void {
    this.circuitProbeInFlight.delete(channel);
    const failures = (this.circuitFailures.get(channel) ?? 0) + 1;
    this.circuitFailures.set(channel, failures);
    this.metrics?.recordNotificationDelivery(channel, 'failure');
    const threshold = this.getCircuitThreshold();
    if (failures >= Math.max(1, threshold) && !this.circuitOpenedAt.has(channel)) {
      this.circuitOpenedAt.set(channel, Date.now());
      this.metrics?.setNotificationCircuitOpen(channel, true);
      this.logger.error(
        `Notification provider circuit opened for channel ${channel} after ${failures} failures`,
      );
    }
  }

  private buildSendFn(
    channel: DeliveryChannel,
    user: User,
    notification: Pick<InAppNotification, 'title' | 'body'>,
  ): () => Promise<void> {
    switch (channel) {
      case DeliveryChannel.EMAIL:
        return () => this.dispatchEmail(user, notification as InAppNotification);
      case DeliveryChannel.PUSH:
        return () => this.dispatchPush(user, notification as InAppNotification);
      case DeliveryChannel.SMS:
        return () => this.dispatchSms(user, notification as InAppNotification);
      default:
        return () => Promise.resolve();
    }
  }

  private async dispatchEmail(user: User, notification: InAppNotification): Promise<void> {
    if (!user.email) {
      throw new Error('User has no email address');
    }
    const html = await this.emailTemplateService.render('notification', {
      title: notification.title,
      body: notification.body,
      firstName: user.firstName ?? '',
    });
    this.logger.log(
      `[EMAIL] → ${user.email} | subject: ${notification.title} | html length: ${html.length}`,
    );
  }

  private async dispatchPush(user: User, notification: InAppNotification): Promise<void> {
    if (!user.fcmToken) {
      throw new Error('User has no FCM token registered');
    }
    const success = await this.pushNotificationService.sendPushNotification(
      user.fcmToken,
      notification.title,
      notification.body,
      notification.data
        ? Object.fromEntries(Object.entries(notification.data).map(([k, v]) => [k, String(v)]))
        : {},
    );
    if (!success) {
      throw new Error('FCM delivery returned false');
    }
  }

  private async dispatchSms(user: User, notification: InAppNotification): Promise<void> {
    if (!user.phone) {
      throw new Error('User has no phone number registered');
    }
    await this.smsService.sendSms(user.phone, `${notification.title}: ${notification.body}`);
  }

  private async createLog(
    notificationId: string,
    channel: DeliveryChannel,
  ): Promise<NotificationDeliveryLog> {
    const log = this.deliveryLogRepo.create({
      notificationId,
      channel,
      status: DeliveryStatus.PENDING,
      attempts: 0,
      attemptedAt: new Date(),
    });
    return this.deliveryLogRepo.save(log);
  }

  private async updateLog(
    logId: string,
    status: DeliveryStatus,
    attempts: number,
    errorMessage: string | null,
  ): Promise<void> {
    await this.deliveryLogRepo.update(logId, {
      status,
      attempts,
      attemptedAt: new Date(),
      errorMessage,
    });
  }

  private async markChannelDelivered(
    notificationId: string,
    channel: DeliveryChannel,
  ): Promise<void> {
    await this.deliveryLogRepo.manager
      .createQueryBuilder()
      .update('in_app_notifications')
      .set({
        deliveredChannels: () => `array_append("deliveredChannels", '${channel}')`,
      })
      .where('id = :id', { id: notificationId })
      .execute();
  }

  // ── Config helpers (with safe fallbacks for unit tests) ──────────────────────

  private getMaxAttempts(): number {
    return this.config?.get<number>('NOTIFICATION_RETRY_MAX_ATTEMPTS', 3) ?? 3;
  }

  private getRetryDelayMs(attempt: number): number {
    const base = this.config?.get<number>('NOTIFICATION_RETRY_BASE_DELAY_MS', 1000) ?? 1000;
    return base * Math.pow(2, attempt);
  }

  private getCircuitResetMs(): number {
    return this.config?.get<number>('NOTIFICATION_CIRCUIT_RESET_MS', 30000) ?? 30000;
  }

  private getCircuitThreshold(): number {
    return this.config?.get<number>('NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD', 5) ?? 5;
  }

  private getTerminalStrategy(): 'escalate' | 'silent' {
    return this.config?.get<string>('NOTIFICATION_RETRY_TERMINAL_FAILURE_STRATEGY', 'escalate') ===
      'silent'
      ? 'silent'
      : 'escalate';
  }
}
