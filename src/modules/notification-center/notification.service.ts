import { Injectable } from '@nestjs/common';
import { NotificationCenterService } from './notification-center.service';
import { NotificationTypeEnum } from './entities/in-app-notification.entity';

export interface LegacyNotificationInput {
  userId: string | number;
  type?: string;
  title: string;
  body?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface MultiChannelInput {
  email?: { template?: string; data?: Record<string, unknown> };
  push?: { title: string; body: string; data?: Record<string, unknown> };
  sms?: { message: string };
}

/**
 * Backwards-compatible application API backed by NotificationCenterService.
 * Every legacy call now persists an in-app notification and enters the same
 * preference-aware channel router, delivery log, and retry pipeline.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly center: NotificationCenterService) {}

  async createNotification(input: LegacyNotificationInput) {
    return this.center.sendNotification({
      userId: String(input.userId),
      type: this.mapType(input.type),
      title: input.title,
      body: input.body ?? input.message ?? input.title,
      data: input.data,
    });
  }

  async sendEmail(
    userId: string,
    template: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    await this.createNotification({
      userId,
      type: template,
      title: this.humanize(template),
      body: this.bodyFromData(data),
      data: { ...data, requestedChannel: 'email', template },
    });
    return true;
  }

  async sendSMS(userId: string, message: string): Promise<boolean> {
    await this.createNotification({
      userId,
      title: 'SMS notification',
      body: message,
      data: { requestedChannel: 'sms' },
    });
    return true;
  }

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<boolean> {
    await this.createNotification({
      userId,
      title,
      body,
      data: { ...data, requestedChannel: 'push' },
    });
    return true;
  }

  async sendMultiChannel(userId: string, input: MultiChannelInput): Promise<boolean> {
    const email = input.email;
    const push = input.push;
    const sms = input.sms;
    await this.createNotification({
      userId,
      type: email?.template,
      title: push?.title ?? this.humanize(email?.template ?? 'notification'),
      body: push?.body ?? sms?.message ?? this.bodyFromData(email?.data ?? {}),
      data: {
        ...(email?.data ?? {}),
        ...(push?.data ?? {}),
        requestedChannels: Object.keys(input),
        template: email?.template,
      },
    });
    return true;
  }

  getNotifications(userId: string) {
    return this.center.getInbox(userId, { page: 1, limit: 100 });
  }

  getUnreadCount(userId: string) {
    return this.center.getUnreadCount(userId);
  }

  markAllAsRead(userId: string) {
    return this.center.markAllRead(userId);
  }

  sendCouponExpiryReminder(input: {
    userId: string;
    couponId: string;
    expiresAt: Date;
    code: string;
  }) {
    return this.createNotification({
      userId: input.userId,
      type: NotificationTypeEnum.COUPON_EXPIRY,
      title: 'Coupon expiring soon',
      body: `Coupon ${input.code} expires soon.`,
      data: input as unknown as Record<string, unknown>,
    });
  }

  sendPendingTaskDigest(input: { userId: string; tasks: unknown[] }) {
    return this.createNotification({
      userId: input.userId,
      type: NotificationTypeEnum.TASK_REMINDER,
      title: 'Pending health tasks',
      body: `You have ${input.tasks.length} pending health task(s).`,
      data: { tasks: input.tasks },
    });
  }

  private mapType(type?: string): NotificationTypeEnum {
    const values = Object.values(NotificationTypeEnum) as string[];
    return values.includes(type ?? '')
      ? (type as NotificationTypeEnum)
      : NotificationTypeEnum.SYSTEM;
  }

  private humanize(value: string): string {
    return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private bodyFromData(data: Record<string, unknown>): string {
    const message = data.message ?? data.body;
    return typeof message === 'string' ? message : JSON.stringify(data);
  }
}
