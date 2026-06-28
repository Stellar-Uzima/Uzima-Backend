import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig, getRedisUrl } from '../../config/redis.config';
import { NotificationPreference } from '../entities/notification-preference.entity';

export interface NotificationOptions {
  userId: string;
  type?: 'email' | 'sms' | 'push';
  template?: string;
  data?: any;
}

export interface SendNotificationOptions {
  template?: string;
  data?: any;
  message?: string;
  title?: string;
  body?: string;
  isCritical?: boolean; // Bypass rate limits for critical notifications
  notificationType?: string; // For push notification debouncing
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly redis: Redis;

  // Rate limit constants
  private readonly EMAIL_RATE_LIMIT = 5; // max 5 per hour
  private readonly EMAIL_WINDOW_SECONDS = 3600; // 1 hour
  private readonly SMS_RATE_LIMIT = 10; // max 10 per day
  private readonly SMS_WINDOW_SECONDS = 86400; // 24 hours
  private readonly PUSH_DEBOUNCE_SECONDS = 300; // 5 minutes

  // Redis key prefixes
  private readonly EMAIL_RATE_KEY = 'notification:email:';
  private readonly SMS_RATE_KEY = 'notification:sms:';
  private readonly PUSH_DEBOUNCE_KEY = 'notification:push:';

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    private readonly configService: ConfigService,
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config));
  }

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
   * Check and enforce email rate limit (5 per hour per user)
   * Returns true if within rate limit, false if exceeded
   */
  private async checkEmailRateLimit(userId: string): Promise<boolean> {
    const key = `${this.EMAIL_RATE_KEY}${userId}`;
    const currentCount = await this.redis.get(key);
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    if (count >= this.EMAIL_RATE_LIMIT) {
      this.logger.warn(
        `Email rate limit exceeded for user ${userId}. Count: ${count}/${this.EMAIL_RATE_LIMIT} per hour`,
      );
      return false;
    }

    // Increment counter and set expiry
    await this.redis.incr(key);
    await this.redis.expire(key, this.EMAIL_WINDOW_SECONDS);

    return true;
  }

  /**
   * Check and enforce SMS rate limit (10 per day per user)
   * Returns true if within rate limit, false if exceeded
   */
  private async checkSMSRateLimit(userId: string): Promise<boolean> {
    const key = `${this.SMS_RATE_KEY}${userId}`;
    const currentCount = await this.redis.get(key);
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    if (count >= this.SMS_RATE_LIMIT) {
      this.logger.warn(
        `SMS rate limit exceeded for user ${userId}. Count: ${count}/${this.SMS_RATE_LIMIT} per day`,
      );
      return false;
    }

    // Increment counter and set expiry
    await this.redis.incr(key);
    await this.redis.expire(key, this.SMS_WINDOW_SECONDS);

    return true;
  }

  /**
   * Check and enforce push notification debounce (same type not sent more than once per 5 minutes)
   * Returns true if allowed to send, false if debounced
   */
  private async checkPushDebounce(
    userId: string,
    notificationType?: string,
  ): Promise<boolean> {
    // Use a default type if none provided
    const type = notificationType || 'default';
    const key = `${this.PUSH_DEBOUNCE_KEY}${userId}:${type}`;

    const exists = await this.redis.exists(key);
    if (exists) {
      this.logger.debug(
        `Push notification debounced for user ${userId}, type: ${type}`,
      );
      return false;
    }

    // Set key with expiry to allow next notification after debounce period
    await this.redis.set(key, '1', 'EX', this.PUSH_DEBOUNCE_SECONDS);

    return true;
  }

  /**
   * Send an email notification if the user has enabled email notifications
   * Rate limited: max 5 per hour per user (bypassed for critical notifications)
   */
  async sendEmail(
    userId: string,
    template: string,
    data: any,
    isCritical?: boolean,
  ): Promise<boolean> {
    const canSend = await this.canSendNotification(userId, 'email');

    if (!canSend) {
      this.logger.debug(
        `Email notifications disabled for user ${userId}. Skipping.`,
      );
      return false;
    }

    // Check rate limit unless this is a critical notification
    if (!isCritical) {
      const withinLimit = await this.checkEmailRateLimit(userId);
      if (!withinLimit) {
        this.logger.warn(
          `Email notification skipped for user ${userId} due to rate limit. Template: ${template}`,
        );
        return false;
      }
    } else {
      this.logger.debug(
        `Critical email notification bypassing rate limit for user ${userId}`,
      );
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
   * Rate limited: max 10 per day per user (bypassed for critical notifications)
   */
  async sendSMS(
    userId: string,
    message: string,
    isCritical?: boolean,
  ): Promise<boolean> {
    const canSend = await this.canSendNotification(userId, 'sms');

    if (!canSend) {
      this.logger.debug(
        `SMS notifications disabled for user ${userId}. Skipping.`,
      );
      return false;
    }

    // Check rate limit unless this is a critical notification
    if (!isCritical) {
      const withinLimit = await this.checkSMSRateLimit(userId);
      if (!withinLimit) {
        this.logger.warn(
          `SMS notification skipped for user ${userId} due to rate limit. Message: ${message.substring(0, 50)}...`,
        );
        return false;
      }
    } else {
      this.logger.debug(
        `Critical SMS notification bypassing rate limit for user ${userId}`,
      );
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
   * Debounced: same notification type not sent more than once per 5 minutes per user
   * (bypassed for critical notifications)
   */
  async sendPush(
    userId: string,
    title: string,
    body: string,
    isCritical?: boolean,
    notificationType?: string,
  ): Promise<boolean> {
    const canSend = await this.canSendNotification(userId, 'push');

    if (!canSend) {
      this.logger.debug(
        `Push notifications disabled for user ${userId}. Skipping.`,
      );
      return false;
    }

    // Check debounce unless this is a critical notification
    if (!isCritical) {
      const allowed = await this.checkPushDebounce(userId, notificationType);
      if (!allowed) {
        this.logger.debug(
          `Push notification skipped for user ${userId} due to debounce. Type: ${notificationType || 'default'}`,
        );
        return false;
      }
    } else {
      this.logger.debug(
        `Critical push notification bypassing debounce for user ${userId}`,
      );
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
   * Supports critical notification flag to bypass rate limits
   */
  async sendMultiChannel(
    userId: string,
    options: {
      email?: { template: string; data: any };
      sms?: { message: string };
      push?: { title: string; body: string; type?: string };
      isCritical?: boolean;
    },
  ): Promise<{ email?: boolean; sms?: boolean; push?: boolean }> {
    const results: { email?: boolean; sms?: boolean; push?: boolean } = {};

    if (options.email) {
      results.email = await this.sendEmail(
        userId,
        options.email.template,
        options.email.data,
        options.isCritical,
      );
    }

    if (options.sms) {
      results.sms = await this.sendSMS(
        userId,
        options.sms.message,
        options.isCritical,
      );
    }

    if (options.push) {
      results.push = await this.sendPush(
        userId,
        options.push.title,
        options.push.body,
        options.isCritical,
        options.push.type,
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
