import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { redisConfig, getRedisUrl } from '../config/redis.config';
import { Coupon, CouponStatus } from '../entities/coupon.entity';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import {
  REWARD_MILESTONE_EVENT,
  RewardMilestonePayload,
} from './coupon.events';

const CONFIGURED_MILESTONES = new Set<string>([
  '100',
  '500',
  '1000',
  '5000',
  '10000',
]);

const MILESTONE_DEDUP_KEY_PREFIX = 'coupon_milestone:';
const MILESTONE_DEDUP_TTL_SECONDS = 60 * 60 * 24 * 365;

export interface ValidateCouponResult {
  valid: boolean;
  reason?: string;
}

const MAX_ACTIVE_COUPONS_PER_USER = 5;
const MAX_VALIDATION_ATTEMPTS_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_KEY_PREFIX = 'coupon_validate:';
const REDEMPTION_LOCK_KEY_PREFIX = 'coupon_redeem:';
const REDEMPTION_LOCK_TTL = 10;
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
          this.logger.warn(
            'reward.milestone event received with no userId; skipping',
          );
          return;
        }
        if (!CONFIGURED_MILESTONES.has(String(payload.milestone))) {
          this.logger.warn(
            `Milestone ${payload.milestone} is not configured for rewards; skipping`,
          );
          return;
        }
        try {
          const created = await this.createForMilestone(payload.userId, {
            milestone: String(payload.milestone),
          });
          if (created) {
            this.logger.log(
              `Coupon created for milestone for user ${payload.userId}`,
            );
          }
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
    payload?: { specialistType?: string; discount?: number; milestone?: string },
  ): Promise<Coupon | null> {
    if (payload?.milestone) {
      const dedupKey = `${MILESTONE_DEDUP_KEY_PREFIX}${userId}:${payload.milestone}`;
      const alreadyProcessed = await this.redis.get(dedupKey);
      if (alreadyProcessed) {
        this.logger.warn(
          `Milestone ${payload.milestone} already processed for user ${userId}; skipping duplicate reward`,
        );
        return null;
      }
      const claimed = await this.redis.set(
        dedupKey,
        '1',
        'EX',
        MILESTONE_DEDUP_TTL_SECONDS,
        'NX',
      );
      if (claimed !== 'OK') {
        this.logger.warn(
          `Milestone ${payload.milestone} concurrently processed for user ${userId}; skipping duplicate reward`,
        );
        return null;
      }
    }

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
      specialistType: payload?.specialistType ?? undefined,
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
    return this.couponRepository
      .find({
        where: {
          userId,
          status: CouponStatus.ACTIVE,
        },
        order: { expiresAt: 'ASC' },
      })
      .then((list) => list.filter((c) => c.expiresAt > now));
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

    this.logger.log(
      `Marked ${result.affected ?? 0} expired coupons as EXPIRED`,
    );
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

    if (coupon.status === CouponStatus.REDEEMED) {
      return { valid: false, reason: 'already_used' };
    }

    if (coupon.status === CouponStatus.EXPIRED) {
      return { valid: false, reason: 'expired' };
    }

    if (coupon.status === CouponStatus.DISABLED) {
      return { valid: false, reason: 'disabled' };
    }

    if (new Date() > coupon.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, reason: 'exhausted' };
    }

    if (coupon.userId !== currentUserId) {
      throw new ForbiddenException(
        'Coupon does not belong to the current user',
      );
    }

    return { valid: true };
  }

  /**
   * Redeem a coupon atomically. Uses a Redis lock to serialize concurrent
   * redemptions and a conditional Update to guarantee the usage limit is not
   * exceeded under concurrency.
   */
  async redeem(
    couponCode: string,
    userId: string,
  ): Promise<Coupon> {
    const normalizedCode = couponCode.trim().toUpperCase();
    const lockKey = `${REDEMPTION_LOCK_KEY_PREFIX}${normalizedCode}`;
    const lockValue = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const locked = await this.redis.set(
      lockKey,
      lockValue,
      'NX',
      'EX',
      REDEMPTION_LOCK_TTL,
    );
    if (locked !== 'OK') {
      throw new BadRequestException(
        'Coupon redemption in progress; please retry',
      );
    }

    try {
      const coupon = await this.couponRepository.findOne({
        where: { code: normalizedCode },
      });

      if (!coupon) {
        throw new NotFoundException('Coupon not found');
      }

      if (coupon.userId !== userId) {
        throw new ForbiddenException(
          'Coupon does not belong to the current user',
        );
      }

      if (coupon.status === CouponStatus.REDEEMED) {
        throw new BadRequestException('Coupon already redeemed');
      }

      if (coupon.status === CouponStatus.EXPIRED) {
        throw new BadRequestException('Coupon has expired');
      }

      if (coupon.status === CouponStatus.DISABLED) {
        throw new BadRequestException('Coupon is disabled');
      }

      if (new Date() > coupon.expiresAt) {
        throw new BadRequestException('Coupon has expired');
      }

      // Atomic conditional update: only increment while the usage limit has not
      // been reached and the coupon is still active. This prevents concurrent
      // redemptions from exceeding the configured limit.
      const now = new Date();
      const updateResult = await this.couponRepository
        .createQueryBuilder()
        .update(Coupon)
        .set({
          usageCount: () => 'usageCount + 1',
          usedAt: now,
          status: () =>
            'CASE WHEN usageCount + 1 >= usageLimit THEN :redeemed ELSE status END',
        })
        .setParameters({ redeemed: CouponStatus.REDEEMED })
        .where('id = :id', { id: coupon.id })
        .andWhere('status = :status', { status: CouponStatus.ACTIVE })
        .andWhere('expiresAt > :now', { now })
        .andWhere('(usageLimit IS NULL) OR (usageCount < usageLimit)')
        .execute();

      if ((updateResult.affected ?? 0) === 0) {
        // Re-read to determine the precise reason for rejection.
        const fresh = await this.couponRepository.findOne({
          where: { id: coupon.id },
        });
        if (!fresh) {
          throw new NotFoundException('Coupon not found');
        }
        if (fresh.status === CouponStatus.REDEEMED) {
          throw new BadRequestException('Coupon already redeemed');
        }
        if (fresh.status === CouponStatus.EXPIRED || new Date() > fresh.expiresAt) {
          throw new BadRequestException('Coupon has expired');
        }
        if (fresh.status === CouponStatus.DISABLED) {
          throw new BadRequestException('Coupon is disabled');
        }
        if (
          fresh.usageLimit != null &&
          fresh.usageCount >= fresh.usageLimit
        ) {
          throw new BadRequestException('Coupon usage limit exhausted');
        }
        throw new BadRequestException('Coupon cannot be redeemed');
      }

      const updated = await this.couponRepository.findOne({
        where: { id: coupon.id },
      });
      if (!updated) {
        throw new NotFoundException('Coupon not found');
      }

      this.logger.log(
        `Coupon ${normalizedCode} redeemed by user ${userId} (usage ${updated.usageCount}/${updated.usageLimit ?? 'unlimited'})`,
      );
      return updated;
    } finally {
      // Release the lock only if we still own it.
      const current = await this.redis.get(lockKey);
      if (current === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }
}
