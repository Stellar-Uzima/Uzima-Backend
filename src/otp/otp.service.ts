import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { redisConfig, getRedisUrl } from '../config/redis.config';

export interface OtpRequestResult {
  success: boolean;
  message: string;
  remainingAttempts?: number;
  lockoutMinutes?: number;
}

export interface OtpVerificationResult {
  success: boolean;
  message: string;
}

@Injectable()
export class OtpService {
  private readonly redis: Redis;
  private readonly logger = new Logger(OtpService.name);

  // OTP settings
  private readonly OTP_TTL = 600; // 10 minutes in seconds
  private readonly OTP_LENGTH = 6;
  private readonly MAX_REQUESTS_PER_HOUR = 3;
  private readonly REQUEST_WINDOW = 3600; // 1 hour in seconds
  private readonly MAX_FAILED_ATTEMPTS = 3;
  private readonly LOCKOUT_DURATION = 1800; // 30 minutes in seconds

  // Redis key prefixes
  private readonly OTP_KEY_PREFIX = 'otp:';
  private readonly OTP_REQUEST_COUNT_PREFIX = 'otp_requests:';
  private readonly OTP_FAILED_ATTEMPTS_PREFIX = 'otp_failed:';
  private readonly OTP_LOCK_PREFIX = 'otp_lock:';

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config));
  }

  /**
   * Generate and store OTP for a phone number
   * Rate limited: max 3 requests per phone per hour
   */
  async requestOtp(phoneNumber: string): Promise<OtpRequestResult> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const lockKey = `${this.OTP_LOCK_PREFIX}${normalizedPhone}`;
    const requestCountKey = `${this.OTP_REQUEST_COUNT_PREFIX}${normalizedPhone}`;

    // Check if phone is locked due to failed attempts
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      return {
        success: false,
        message: 'Phone number is temporarily locked due to too many failed attempts',
        lockoutMinutes: Math.ceil(ttl / 60),
      };
    }

    // Check rate limit (max 3 requests per hour)
    const requestCount = await this.redis.get(requestCountKey);
    const currentCount = requestCount ? parseInt(requestCount, 10) : 0;

    if (currentCount >= this.MAX_REQUESTS_PER_HOUR) {
      const ttl = await this.redis.ttl(requestCountKey);
      return {
        success: false,
        message: 'Maximum OTP requests exceeded. Please try again later.',
        remainingAttempts: 0,
        lockoutMinutes: Math.ceil(ttl / 60),
      };
    }

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const otpKey = `${this.OTP_KEY_PREFIX}${normalizedPhone}`;

    // Store OTP in Redis with 10-minute TTL
    await this.redis.setex(otpKey, this.OTP_TTL, otp);

    // Increment request count
    const pipeline = this.redis.pipeline();
    pipeline.incr(requestCountKey);
    pipeline.expire(requestCountKey, this.REQUEST_WINDOW);
    await pipeline.exec();

    const newCount = currentCount + 1;
    const remainingAttempts = this.MAX_REQUESTS_PER_HOUR - newCount;

    // Emit event for SMS sending
    this.eventEmitter.emit('otp.requested', {
      phoneNumber: normalizedPhone,
      otp,
      remainingAttempts,
    });

    this.logger.log(`OTP generated for ${normalizedPhone}`);

    return {
      success: true,
      message: 'OTP sent successfully',
      remainingAttempts,
    };
  }

  /**
   * Verify OTP for a phone number
   * 3 failed attempts locks phone for 30 minutes
   */
  async verifyOtp(
    phoneNumber: string,
    otp: string,
  ): Promise<OtpVerificationResult> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const otpKey = `${this.OTP_KEY_PREFIX}${normalizedPhone}`;
    const failedAttemptsKey = `${this.OTP_FAILED_ATTEMPTS_PREFIX}${normalizedPhone}`;
    const lockKey = `${this.OTP_LOCK_PREFIX}${normalizedPhone}`;

    // Check if phone is locked
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      return {
        success: false,
        message: `Phone number is locked. Please try again in ${Math.ceil(ttl / 60)} minutes.`,
      };
    }

    // Get stored OTP
    const storedOtp = await this.redis.get(otpKey);

    if (!storedOtp) {
      return {
        success: false,
        message: 'OTP has expired or does not exist. Please request a new one.',
      };
    }

    // Verify OTP
    if (storedOtp !== otp) {
      // Increment failed attempts
      const pipeline = this.redis.pipeline();
      pipeline.incr(failedAttemptsKey);
      pipeline.expire(failedAttemptsKey, this.OTP_TTL);
      const results = await pipeline.exec();
      const failedAttempts = results?.[0]?.[1] as number;

      // Check if max failed attempts reached
      if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
        // Lock the phone for 30 minutes
        await this.redis.setex(lockKey, this.LOCKOUT_DURATION, 'locked');
        // Clean up failed attempts counter
        await this.redis.del(failedAttemptsKey);
        // Clean up OTP
        await this.redis.del(otpKey);

        this.logger.warn(`Phone ${normalizedPhone} locked due to failed OTP attempts`);

        return {
          success: false,
          message: 'Too many failed attempts. Phone number is locked for 30 minutes.',
        };
      }

      const remainingAttempts = this.MAX_FAILED_ATTEMPTS - failedAttempts;

      return {
        success: false,
        message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
      };
    }

    // OTP verified successfully
    // Clean up all related keys
    const cleanupPipeline = this.redis.pipeline();
    cleanupPipeline.del(otpKey);
    cleanupPipeline.del(failedAttemptsKey);
    cleanupPipeline.del(`${this.OTP_REQUEST_COUNT_PREFIX}${normalizedPhone}`);
    await cleanupPipeline.exec();

    this.logger.log(`OTP verified successfully for ${normalizedPhone}`);

    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  /**
   * Generate a 6-digit OTP
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Normalize phone number (remove spaces, dashes, etc.)
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\s+/g, '').replace(/[-()]/g, '');
  }

  /**
   * Check if a phone is currently locked
   */
  async isPhoneLocked(phoneNumber: string): Promise<{ locked: boolean; remainingMinutes?: number }> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const lockKey = `${this.OTP_LOCK_PREFIX}${normalizedPhone}`;
    
    const ttl = await this.redis.ttl(lockKey);
    
    if (ttl > 0) {
      return {
        locked: true,
        remainingMinutes: Math.ceil(ttl / 60),
      };
    }
    
    return { locked: false };
  }
}
