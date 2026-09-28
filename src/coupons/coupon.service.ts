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
          this.logger.warn(
            'reward.milestone event received with no userId; skipping',
          );
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

    if (
      coupon.status === CouponStatus.EXPIRED ||
      new Date() > coupon.expiresAt
    ) {
      return { valid: false, reason: 'expired' };
    }

    if (coupon.userId !== currentUserId) {
      throw new ForbiddenException(
        'Coupon does not belong to the current user',
      );
    }

    return { valid: true };
  }

  /**
   * Admin: Create a new coupon for a specific user
   */
  async createCoupon(
    userId: string,
    payload: { discount?: number; specialistType?: string; daysValid?: number; expiresAt?: Date },
  ): Promise<Coupon> {
    const expiresAt = payload.expiresAt
      ? new Date(payload.expiresAt)
      : new Date(Date.now() + (payload.daysValid ?? DEFAULT_COUPON_DAYS_VALID) * 24 * 60 * 60 * 1000);

    const coupon = this.couponRepository.create({
      userId,
      code: this.generateCouponCode(),
      discount: payload.discount ?? DEFAULT_DISCOUNT_PERCENT,
      specialistType: payload.specialistType ?? undefined,
      expiresAt,
      status: CouponStatus.ACTIVE,
    });
    const saved = await this.couponRepository.save(coupon);
    this.logger.log(`Coupon created by admin: ${saved.code} for user ${userId}`);
    return saved;
  }

  /**
   * Admin: Bulk create coupons
   */
  async bulkCreateCoupons(
    userIds: string[],
    payload: { discount?: number; specialistType?: string; daysValid?: number },
  ): Promise<Coupon[]> {
    const coupons: Coupon[] = [];
    for (const userId of userIds) {
      const coupon = await this.createCoupon(userId, payload);
      coupons.push(coupon);
    }
    return coupons;
  }

  /**
   * Admin: Get coupon analytics
   */
  async getCouponAnalytics(): Promise<any> {
    const totalCoupons = await this.couponRepository.count();
    const activeCoupons = await this.couponRepository.count({
      where: { status: CouponStatus.ACTIVE },
    });
    const redeemedCoupons = await this.couponRepository.count({
      where: { status: CouponStatus.REDEEMED },
    });
    const expiredCoupons = await this.couponRepository.count({
      where: { status: CouponStatus.EXPIRED },
    });

    const byStatus = await this.couponRepository
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status')
      .getRawMany();

    const byDiscount = await this.couponRepository
      .createQueryBuilder('c')
      .select('c.discount', 'discount')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.discount')
      .orderBy('c.discount', 'ASC')
      .getRawMany();

    const recentCoupons = await this.couponRepository
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .take(20)
      .getMany();

    const redemptionRate = totalCoupons > 0 ? (redeemedCoupons / totalCoupons) * 100 : 0;

    return {
      summary: {
        totalCoupons,
        activeCoupons,
        redeemedCoupons,
        expiredCoupons,
        redemptionRate: Math.round(redemptionRate * 100) / 100,
      },
      byStatus,
      byDiscount,
      recentCoupons: recentCoupons.map((c) => ({
        id: c.id,
        code: c.code,
        userId: c.userId,
        discount: c.discount,
        status: c.status,
        expiresAt: c.expiresAt,
        usedAt: c.usedAt,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Admin: Mark a coupon as redeemed (for manual redemption tracking)
   */
  async markAsRedeemed(couponCode: string, redeemedBy: string): Promise<Coupon> {
    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await this.couponRepository.findOne({ where: { code: normalizedCode } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    if (coupon.status === CouponStatus.REDEEMED) {
      throw new BadRequestException('Coupon already redeemed');
    }
    if (coupon.status === CouponStatus.EXPIRED || new Date() > coupon.expiresAt) {
      throw new BadRequestException('Coupon has expired');
    }

    coupon.status = CouponStatus.REDEEMED;
    coupon.usedAt = new Date();
    await this.couponRepository.save(coupon);

    this.logger.log(`Coupon manually marked as redeemed: ${normalizedCode} by ${redeemedBy}`);
    return coupon;
  }

  /**
   * Admin: Extend coupon expiration
   */
  async extendExpiration(couponCode: string, additionalDays: number): Promise<Coupon> {
    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await this.couponRepository.findOne({ where: { code: normalizedCode } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    if (coupon.status === CouponStatus.REDEEMED) {
      throw new BadRequestException('Cannot extend expiration of redeemed coupon');
    }

    coupon.expiresAt = new Date(coupon.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    if (coupon.status === CouponStatus.EXPIRED) {
      coupon.status = CouponStatus.ACTIVE;
    }
    await this.couponRepository.save(coupon);

    this.logger.log(`Coupon expiration extended: ${normalizedCode} by ${additionalDays} days`);
    return coupon;
  }

  private generateCouponCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
