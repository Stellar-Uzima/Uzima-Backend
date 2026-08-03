import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationDeliveryLog, DeliveryStatus } from './entities/notification-delivery-log.entity';
import { InAppNotification, DeliveryChannel } from './entities/in-app-notification.entity';
import { SmsService } from '../../shared/sms/sms.service';
import { PushNotificationService } from '../../shared/notifications/services/push-notification.service';
import { EmailTemplateService } from '../../shared/notifications/services/email-template.service';
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
  ) {}

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
        enabled: preferences?.emailNotifications ?? true,
        send: () => this.dispatchEmail(user, notification),
      },
      {
        channel: DeliveryChannel.PUSH,
        enabled: preferences?.pushNotifications ?? true,
        send: () => this.dispatchPush(user, notification),
      },
      {
        channel: DeliveryChannel.SMS,
        enabled: preferences?.smsNotifications ?? true,
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
      await sendFn();
      await this.updateLog(logId, DeliveryStatus.SENT, attempt, null);
      await this.markChannelDelivered(notificationId, channel);
    } catch (err: any) {
      const errorMessage: string = err?.message ?? String(err);
      this.logger.warn(
        `Retry attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS} failed for notification ${notificationId} channel ${channel}: ${errorMessage}`,
      );

      if (attempt >= MAX_DELIVERY_ATTEMPTS) {
        await this.updateLog(logId, DeliveryStatus.FAILED, attempt, errorMessage);
        this.logger.error(
          `Notification ${notificationId} channel ${channel} permanently failed after ${MAX_DELIVERY_ATTEMPTS} attempts`,
        );
      } else {
        await this.updateLog(logId, DeliveryStatus.PENDING, attempt, errorMessage);
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.retryQueue.add(
          RETRY_DELIVERY_JOB,
          { notificationId, logId, channel, userId, title, body, attempt: attempt + 1 },
          {
            delay,
            attempts: 1, // we manage our own retry count
            removeOnComplete: true,
            removeOnFail: 50,
          },
        );
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
    attempt: number,
  ): Promise<void> {
    const log = await this.createLog(notification.id, channel);

    try {
      await send();
      await this.updateLog(log.id, DeliveryStatus.SENT, attempt, null);
      await this.markChannelDelivered(notification.id, channel);
    } catch (err: any) {
      const errorMessage: string = err?.message ?? String(err);
      this.logger.warn(
        `Initial delivery failed for notification ${notification.id} channel ${channel}: ${errorMessage}`,
      );

      if (attempt >= MAX_DELIVERY_ATTEMPTS) {
        await this.updateLog(log.id, DeliveryStatus.FAILED, attempt, errorMessage);
      } else {
        await this.updateLog(log.id, DeliveryStatus.PENDING, attempt, errorMessage);
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.retryQueue.add(
          RETRY_DELIVERY_JOB,
          {
            notificationId: notification.id,
            logId: log.id,
            channel,
            userId: user.id,
            title: notification.title,
            body: notification.body,
            attempt: attempt + 1,
          },
          {
            delay,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        );
      }
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

    // Render a generic notification template (falls back gracefully if not found)
    let html: string;
    try {
      html = await this.emailTemplateService.render('notification', {
        title: notification.title,
        body: notification.body,
        firstName: user.firstName ?? '',
      });
    } catch {
      // Template not found — use plain text fallback
      html = `<p><strong>${notification.title}</strong></p><p>${notification.body}</p>`;
    }

    // TODO: wire up actual mailer (e.g. SendGrid / Nodemailer) here.
    // For now we log at info level so the flow is testable end-to-end.
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
        ? Object.fromEntries(
            Object.entries(notification.data).map(([k, v]) => [k, String(v)]),
          )
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

    await this.smsService.sendSms(
      user.phone,
      `${notification.title}: ${notification.body}`,
    );
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
    // Use a raw query to append to the deliveredChannels array without a full load
    await this.deliveryLogRepo.manager
      .createQueryBuilder()
      .update('in_app_notifications')
      .set({
        deliveredChannels: () =>
          `array_append("deliveredChannels", '${channel}')`,
      })
      .where('id = :id', { id: notificationId })
      .execute();
  }
}
