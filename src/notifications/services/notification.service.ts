import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';

export interface NotificationOptions {
  userId: string;
  type?: 'email' | 'sms' | 'push';
  template?: string;
  data?: any;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
  ) {}

  /**
   * Check if a user wants to receive notifications via a specific channel
   */
  async canSendNotification(
    userId: string,
    channel: 'email' | 'sms' | 'push',
  ): Promise<boolean> {
    const preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // If no preferences exist, default to allowing all notifications
      return true;
    }

    switch (channel) {
      case 'email':
        return preferences.emailNotifications;
      case 'sms':
        return preferences.smsNotifications;
      case 'push':
        return preferences.pushNotifications;
      default:
        return true;
    }
  }

  /**
   * Send an email notification if the user has enabled email notifications
   */
  async sendEmail(userId: string, template: string, data: any): Promise<boolean> {
    const canSend = await this.canSendNotification(userId, 'email');

    if (!canSend) {
      this.logger.debug(
        `Email notifications disabled for user ${userId}. Skipping.`,
      );
      return false;
    }

    // TODO: Implement actual email sending logic here or emit event
    // For now, log and return success
    this.logger.log(
      `Sending email to user ${userId} with template: ${template}`,
    );

    // Example implementation:
    // - Use a queue job (EMAIL_NOTIFICATION_JOB)
    // - Or call an email service (e.g., SendGrid, AWS SES)
    // - Or emit an event for another service to handle

    return true;
  }

  /**
   * Send an SMS notification if the user has enabled SMS notifications
   */
  async sendSMS(userId: string, message: string): Promise<boolean> {
    const canSend = await this.canSendNotification(userId, 'sms');

    if (!canSend) {
      this.logger.debug(
        `SMS notifications disabled for user ${userId}. Skipping.`,
      );
      return false;
    }

    // TODO: Implement actual SMS sending logic here or emit event
    // For now, log and return success
    this.logger.log(`Sending SMS to user ${userId}: ${message}`);

    // Example implementation:
    // - Use a queue job (SMS_NOTIFICATION_JOB)
    // - Or call an SMS service (e.g., Twilio)
    // - Or emit an event for another service to handle

    return true;
  }

  /**
   * Send a push notification if the user has enabled push notifications
   */
  async sendPush(userId: string, title: string, body: string): Promise<boolean> {
    const canSend = await this.canSendNotification(userId, 'push');

    if (!canSend) {
      this.logger.debug(
        `Push notifications disabled for user ${userId}. Skipping.`,
      );
      return false;
    }

    // TODO: Implement actual push notification logic here or emit event
    // For now, log and return success
    this.logger.log(
      `Sending push notification to user ${userId}: ${title} - ${body}`,
    );

    // Example implementation:
    // - Use a queue job (PUSH_NOTIFICATION_JOB)
    // - Or call a push notification service (e.g., Firebase Cloud Messaging)
    // - Or emit an event for another service to handle

    return true;
  }

  /**
   * Send notifications through multiple channels based on user preferences
   */
  async sendMultiChannel(
    userId: string,
    options: {
      email?: { template: string; data: any };
      sms?: { message: string };
      push?: { title: string; body: string };
    },
  ): Promise<{ email?: boolean; sms?: boolean; push?: boolean }> {
    const results: { email?: boolean; sms?: boolean; push?: boolean } = {};

    if (options.email) {
      results.email = await this.sendEmail(
        userId,
        options.email.template,
        options.email.data,
      );
    }

    if (options.sms) {
      results.sms = await this.sendSMS(userId, options.sms.message);
    }

    if (options.push) {
      results.push = await this.sendPush(
        userId,
        options.push.title,
        options.push.body,
      );
    }

    return results;
  }

  /**
   * Get user's notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreference | null> {
    return this.preferenceRepository.findOne({ where: { userId } });
  }
}
