import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushPlatform, PushSubscription } from '../entities/push-subscription.entity';
import { PushNotificationService } from './push-notification.service';

@Injectable()
export class PushSubscriptionService {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
    private readonly push: PushNotificationService,
  ) {}

  async register(
    userId: string,
    deviceToken: string,
    platform: PushPlatform,
  ): Promise<PushSubscription> {
    const existing = await this.subscriptions.findOne({ where: { deviceToken } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      existing.isActive = true;
      return this.subscriptions.save(existing);
    }

    return this.subscriptions.save(
      this.subscriptions.create({ userId, deviceToken, platform, isActive: true }),
    );
  }

  async revoke(userId: string, deviceToken: string): Promise<void> {
    await this.subscriptions.update(
      { userId, deviceToken },
      { isActive: false },
    );
  }

  async revokeAll(userId: string): Promise<void> {
    await this.subscriptions.update({ userId, isActive: true }, { isActive: false });
  }

  async activeForUser(userId: string): Promise<PushSubscription[]> {
    return this.subscriptions.find({ where: { userId, isActive: true } });
  }

  async disable(deviceToken: string): Promise<void> {
    await this.subscriptions.update({ deviceToken, isActive: true }, { isActive: false });
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<number> {
    const active = await this.activeForUser(userId);
    let sent = 0;
    for (const subscription of active) {
      const result = await this.push.sendPushNotificationWithStatus(
        subscription.deviceToken,
        title,
        body,
        data,
      );
      if (result.sent) sent += 1;
      if (result.permanentFailure) await this.disable(subscription.deviceToken);
    }
    return sent;
  }
}
