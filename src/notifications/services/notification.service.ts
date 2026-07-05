import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  protected readonly logger = new Logger(NotificationService.name);

  async sendCouponExpiryReminder(payload: { userId: string; couponId: string; expiresAt: Date; code: string }): Promise<void> {
    this.logger.log(`Coupon expiry reminder for user ${payload.userId}`);
  }

  async sendPendingTaskDigest(payload: { userId: string; tasks: any[] }): Promise<void> {
    this.logger.log(`Pending task digest for user ${payload.userId}`);
  }
}