import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { redisConfig, getRedisUrl } from '../config/redis.config';
import { Coupon, CouponStatus } from './entities/coupon.entity';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import {
  REWARD_MILESTONE_EVENT,
  RewardMilestonePayload,
} from './coupon.events';

export interface ValidateCouponResult {
  valid: boolean;
  reason?: string;
}

const MAX_ACTIVE_COUPONS_PER_USER = 5;
const MAX_VALIDATION_ATTEMPTS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_KEY_PREFIX = 'coupon_validate:';
const DEFAULT_COUPON_DAYS_VALID = 30;
const DEFAULT_DISCOUNT_PERCENT = 10;

@Injectable()
export class CouponService implements OnModuleInit {
  private readonly redis: Redis;
  private readonly logger = new Logger(CouponService.name);

  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config));
  }

  onModuleInit() {
    this.eventEmitter.on(
      REWARD_MILESTONE_EVENT,
      async (payload: RewardMilestonePayload) => {
        if (!payload?.userId) {
          this.logger.warn('reward.milestone event received with no userId; skipping');
          return;
        }
        try {
          await this.createForMilestone(payload.userId);
          this.logger.log(
            `Coupon created for milestone for user ${payload.userId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to create coupon for milestone: ${(error as Error)?.message}`,
          );
        }
      },
    );
  }

  /**
   * Create a coupon when user reaches an XLM milestone. Enforces max 5 active coupons per user.
   */
  async createForMilestone(
    userId: string,
    payload?: { specialistType?: string; discount?: number },
  ): Promise<Coupon | null> {
    const activeCount = await this.couponRepository.count({
      where: { userId, status: CouponStatus.ACTIVE },
    });
    if (activeCount >= MAX_ACTIVE_COUPONS_PER_USER) {
      this.logger.warn(
        `User ${userId} already has ${MAX_ACTIVE_COUPONS_PER_USER} active coupons; skipping creation`,
      );
      return null;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_COUPON_DAYS_VALID);

    const coupon = this.couponRepository.create({
      userId,
      discount: payload?.discount ?? DEFAULT_DISCOUNT_PERCENT,
      specialistType: payload?.specialistType ?? null,
      expiresAt,
      status: CouponStatus.ACTIVE,
    });
    return this.couponRepository.save(coupon);
  }

  /**
   * Get active coupons for the current user (status ACTIVE and not expired).
   */
  async getActiveForUser(userId: string): Promise<Coupon[]> {
    const now = new Date();
    return this.couponRepository.find({
      where: {
        userId,
        status: CouponStatus.ACTIVE,
      },
      order: { expiresAt: 'ASC' },
    }).then((list) => list.filter((c) => c.expiresAt > now));
  }

  /**
   * Nightly cron: mark expired coupons via QueryBuilder bulk update.
   */
  @Cron('0 0 * * *')
  async markExpiredCron(): Promise<void> {
    const result = await this.couponRepository
      .createQueryBuilder()
      .update(Coupon)
      .set({ status: CouponStatus.EXPIRED })
      .where('status = :status', { status: CouponStatus.ACTIVE })
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    this.logger.log(`Marked ${result.affected ?? 0} expired coupons as EXPIRED`);
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
      this.logger.warn(
        `Coupon validation rate limit exceeded for code: ${normalizedCode}`,
      );
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

    if (coupon.status === CouponStatus.REDEEMED) {
      return { valid: false, reason: 'already_used' };
    }

    if (coupon.status === CouponStatus.EXPIRED || new Date() > coupon.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    if (coupon.userId !== currentUserId) {
      throw new ForbiddenException(
        'Coupon does not belong to the current user',
      );
    }

    return { valid: true };
  }
}
