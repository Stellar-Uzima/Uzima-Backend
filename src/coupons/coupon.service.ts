import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { redisConfig, getRedisUrl } from '../config/redis.config';
import { Coupon } from '../entities/coupon.entity';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

export interface ValidateCouponResult {
  valid: boolean;
  reason?: string;
}

const MAX_VALIDATION_ATTEMPTS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_KEY_PREFIX = 'coupon_validate:';

@Injectable()
export class CouponService {
  private readonly redis: Redis;
  private readonly logger = new Logger(CouponService.name);

  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    private readonly configService: ConfigService,
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config));
  }

  /**
   * Validate a coupon before confirming a consultation booking.
   * Rate limited: max 10 validation attempts per coupon per hour (Redis counter).
   * Does NOT mark the coupon as used.
   */
  async validate(
    dto: ValidateCouponDto,
    currentUserId: string,
  ): Promise<ValidateCouponResult> {
    const normalizedCode = dto.code.trim().toUpperCase();
    const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${normalizedCode}`;

    const attemptCount = await this.redis.get(rateLimitKey);
    const currentCount = attemptCount ? parseInt(attemptCount, 10) : 0;

    if (currentCount >= MAX_VALIDATION_ATTEMPTS_PER_HOUR) {
      this.logger.warn(`Coupon validation rate limit exceeded for code: ${normalizedCode}`);
      return { valid: false, reason: 'rate_limit_exceeded' };
    }

    await this.redis.incr(rateLimitKey);
    await this.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);

    const coupon = await this.couponRepository.findOne({
      where: { code: normalizedCode },
      relations: ['user'],
    });

    if (!coupon) {
      return { valid: false, reason: 'not_found' };
    }

    if (coupon.usedAt) {
      return { valid: false, reason: 'already_used' };
    }

    if (new Date() > coupon.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    if (coupon.userId !== currentUserId) {
      throw new ForbiddenException('Coupon does not belong to the current user');
    }

    return { valid: true };
  }
}
