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

  async sendCouponExpiryReminder(
    payload: CouponReminderPayload,
  ) {

    return this.send({
      userId:
        payload.userId,

      type:
        "COUPON_EXPIRY_REMINDER",

      title:
        "Coupon Expiring Soon",

      body:
        `Your coupon ${payload.code} expires within 24 hours.`,
    });
  }

  async sendPendingTaskDigest(
    payload: PendingTaskDigestPayload,
  ) {

    return this.send({
      userId:
        payload.userId,

      type:
        "PENDING_TASK_DIGEST",

      title:
        "Pending Tasks Reminder",

      body:
        `You have ${payload.tasks.length} incomplete task(s).`,
    });
  }
}