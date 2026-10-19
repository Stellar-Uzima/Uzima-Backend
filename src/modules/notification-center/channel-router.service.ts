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
import {
  NOTIFICATION_CENTER_QUEUE,
  RETRY_DELIVERY_JOB,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
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
    channel: 'email' | 'push' | 'sms'
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
        .map((h) => this.attemptDelivery(h.channel, h.send, notification, user, 1))
    );
  }

  /**
   * Retries a previously failed delivery (called by the queue processor).
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
      const errorMessage: string = err?.message ?? String(err);
      if (err?.code === 'NOTIFICATION_CIRCUIT_OPEN') {
        this.metrics?.recordNotificationDelivery(channel, 'circuit_open');
      } else {
        this.recordProviderFailure(channel);
      }
      this.logger.warn(
        `Retry attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS} failed for notification ${notificationId} channel ${channel}: ${errorMessage}`
      );

      const circuitOpen = err?.code === 'NOTIFICATION_CIRCUIT_OPEN';
      if (attempt >= MAX_DELIVERY_ATTEMPTS && !circuitOpen) {
        await this.updateLog(logId, DeliveryStatus.FAILED, attempt, errorMessage);
        this.logger.error(
          `Notification ${notificationId} channel ${channel} permanently failed after ${MAX_DELIVERY_ATTEMPTS} attempts`
        );
      } else {
        await this.updateLog(logId, DeliveryStatus.PENDING, attempt, errorMessage);
        const delay = circuitOpen
          ? (this.config?.get<number>('NOTIFICATION_CIRCUIT_RESET_MS', 30000) ?? 30000)
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.retryQueue.add(
          RETRY_DELIVERY_JOB,
          { notificationId, logId, channel, userId, title, body, attempt: circuitOpen ? attempt : attempt + 1 },
          {
            delay,
            attempts: 1, // we manage our own retry count
            removeOnComplete: true,
            removeOnFail: 50,
          }
        );
        this.metrics?.incrementNotificationDeliveryRetries(channel);
      }
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
    attempt: number
  ): Promise<void> {
    const log = await this.createLog(notification.id, channel);

    try {
      this.acquireProvider(channel);
      await send();
      this.recordProviderSuccess(channel);
      await this.updateLog(log.id, DeliveryStatus.SENT, attempt, null);
      await this.markChannelDelivered(notification.id, channel);
    } catch (err: any) {
      const errorMessage: string = err?.message ?? String(err);
      if (err?.code === 'NOTIFICATION_CIRCUIT_OPEN') {
        this.metrics?.recordNotificationDelivery(channel, 'circuit_open');
      } else {
        this.recordProviderFailure(channel);
      }
      this.logger.warn(
        `Initial delivery failed for notification ${notification.id} channel ${channel}: ${errorMessage}`
      );

      const circuitOpen = err?.code === 'NOTIFICATION_CIRCUIT_OPEN';
      if (attempt >= MAX_DELIVERY_ATTEMPTS && !circuitOpen) {
        await this.updateLog(log.id, DeliveryStatus.FAILED, attempt, errorMessage);
      } else {
        await this.updateLog(log.id, DeliveryStatus.PENDING, attempt, errorMessage);
        const delay = circuitOpen
          ? (this.config?.get<number>('NOTIFICATION_CIRCUIT_RESET_MS', 30000) ?? 30000)
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.retryQueue.add(
          RETRY_DELIVERY_JOB,
          {
            notificationId: notification.id,
            logId: log.id,
            channel,
            userId: user.id,
            title: notification.title,
            body: notification.body,
            attempt: circuitOpen ? attempt : attempt + 1,
          },
          {
            delay,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: 50,
          }
        );
        this.metrics?.incrementNotificationDeliveryRetries(channel);
      }
    }
  }

  private acquireProvider(channel: DeliveryChannel): void {
    const resetMs = this.config?.get<number>('NOTIFICATION_CIRCUIT_RESET_MS', 30000) ?? 30000;
    const openedAt = this.circuitOpenedAt.get(channel);
    if (openedAt === undefined) return;
    if (Date.now() - openedAt < resetMs || this.circuitProbeInFlight.has(channel)) {
      throw Object.assign(new Error(`Notification provider circuit is open for ${channel}`), {
        code: 'NOTIFICATION_CIRCUIT_OPEN',
      });
    }
    this.circuitProbeInFlight.add(channel);
    this.logger.warn(`Notification provider circuit allowing recovery probe for channel ${channel}`);
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
    const threshold = this.config?.get<number>('NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD', 5) ?? 5;
    if (failures >= Math.max(1, threshold) && !this.circuitOpenedAt.has(channel)) {
      this.circuitOpenedAt.set(channel, Date.now());
      this.metrics?.setNotificationCircuitOpen(channel, true);
      this.logger.error(`Notification provider circuit opened for channel ${channel} after ${failures} failures`);
    }
  }

  private buildSendFn(
    channel: DeliveryChannel,
    user: User,
    notification: Pick<InAppNotification, 'title' | 'body'>
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

    // Rendering is part of the delivery attempt. A rendering/provider failure
    // must reach attemptDelivery so it is logged and queued for retry.
    const html = await this.emailTemplateService.render('notification', {
      title: notification.title,
      body: notification.body,
      firstName: user.firstName ?? '',
    });

    // TODO: wire up actual mailer (e.g. SendGrid / Nodemailer) here.
    // For now we log at info level so the flow is testable end-to-end.
    this.logger.log(
      `[EMAIL] → ${user.email} | subject: ${notification.title} | html length: ${html.length}`
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
        : {}
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
    channel: DeliveryChannel
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
    errorMessage: string | null
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
    channel: DeliveryChannel
  ): Promise<void> {
    // Use a raw query to append to the deliveredChannels array without a full load
    await this.deliveryLogRepo.manager
      .createQueryBuilder()
      .update('in_app_notifications')
      .set({
        deliveredChannels: () => `array_append("deliveredChannels", '${channel}')`,
      })
      .where('id = :id', { id: notificationId })
      .execute();
  }
}
