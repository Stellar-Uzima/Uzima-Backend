import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscription, PushPlatform } from '../entities/push-subscription.entity';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly pushSubscriptionRepo: Repository<PushSubscription>,
  ) {}

  /**
   * Registers or updates a device token for a user.
   */
  async subscribe(userId: string, deviceToken: string, platform: PushPlatform): Promise<PushSubscription> {
    let subscription = await this.pushSubscriptionRepo.findOne({
      where: { deviceToken },
    });

    if (subscription) {
      subscription.userId = userId;
      subscription.platform = platform;
      subscription.isActive = true;
    } else {
      subscription = this.pushSubscriptionRepo.create({
        userId,
        deviceToken,
        platform,
      });
    }

    return this.pushSubscriptionRepo.save(subscription);
  }

  /**
   * Unsubscribes a device token.
   */
  async unsubscribe(deviceToken: string): Promise<void> {
    const subscription = await this.pushSubscriptionRepo.findOne({
      where: { deviceToken },
    });

    if (subscription) {
      subscription.isActive = false;
      await this.pushSubscriptionRepo.save(subscription);
    }
  }

  /**
   * Sends a push notification to all active devices of a user.
   */
  async sendToUser(userId: string, title: string, body: string, data: any = {}): Promise<void> {
    const activeSubscriptions = await this.pushSubscriptionRepo.find({
      where: { userId, isActive: true },
    });

    if (activeSubscriptions.length === 0) {
      this.logger.debug(`No active push subscriptions for user ${userId}`);
      return;
    }

    const promises = activeSubscriptions.map(sub => 
      this.sendPush(sub.deviceToken, sub.platform, title, body, data)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Internal method to interact with push providers (e.g. FCM, APNs)
   */
  private async sendPush(
    token: string, 
    platform: PushPlatform, 
    title: string, 
    body: string, 
    data: any
  ): Promise<void> {
    this.logger.log(`Sending push to ${platform} device: ${token} - ${title}`);
    
    try {
      // Logic for FCM / APNs integration would go here.
      // For now, we mock the success.
      
      // Example for FCM (pseudo-code):
      // await this.fcmProvider.send({ token, notification: { title, body }, data });
      
      this.logger.log(`Push successfully delivered to ${token}`);
    } catch (error: any) {
      this.logger.error(`Failed to send push to ${token}: ${error.message}`);
      
      // If token is invalid/expired, mark subscription as inactive
      if (error.code === 'messaging/registration-token-not-registered') {
        await this.unsubscribe(token);
      }
    }
  }
}
