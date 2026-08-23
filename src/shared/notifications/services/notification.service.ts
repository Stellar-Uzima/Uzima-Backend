import { Injectable, Logger } from '@nestjs/common';

export interface CouponReminderPayload {
  userId: string;

  couponId: string;

  code: string;

  expiresAt: Date;
}

export interface PendingTaskDigestPayload {
  userId: string;

  tasks: Array<{
    id: string;
    title: string;
  }>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /**
   * Dispatch a notification to the user. Until a delivery transport is
   * wired into this shared service, notifications are logged so callers
   * (e.g. reminder schedulers) never fail on a missing provider.
   */
  send(payload: { userId: string; type: string; title: string; body: string }): void {
    this.logger.log(
      `[notification] type=${payload.type} user=${payload.userId} title="${payload.title}"`
    );
  }

  async sendCouponExpiryReminder(payload: CouponReminderPayload) {
    return this.send({
      userId: payload.userId,

      type: 'COUPON_EXPIRY_REMINDER',

      title: 'Coupon Expiring Soon',

      body: `Your coupon ${payload.code} expires within 24 hours.`,
    });
  }

  async sendPendingTaskDigest(payload: PendingTaskDigestPayload) {
    return this.send({
      userId: payload.userId,

      type: 'PENDING_TASK_DIGEST',

      title: 'Pending Tasks Reminder',

      body: `You have ${payload.tasks.length} incomplete task(s).`,
    });
  }
}
