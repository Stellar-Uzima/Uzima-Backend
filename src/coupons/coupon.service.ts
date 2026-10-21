import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import Redis from 'ioredis';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomInt } from 'crypto';
import { redisConfig, getRedisUrl } from '../config/redis.config';
import { Coupon, CouponStatus } from '../entities/coupon.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../audit/entities/audit-log.entity';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { REWARD_MILESTONE_EVENT, RewardMilestonePayload } from './coupon.events';

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

// Postgres error codes
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class CouponService implements OnModuleInit {
  private readonly redis: Redis;
  private readonly logger = new Logger(CouponService.name);

  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config));
  }

  onModuleInit() {
    this.eventEmitter.on(REWARD_MILESTONE_EVENT, (payload: RewardMilestonePayload) => {
      void this.handleRewardMilestone(payload);
    });
  }

  private async handleRewardMilestone(payload: RewardMilestonePayload): Promise<void> {
    if (!payload?.userId) {
      this.logger.warn('reward.milestone event received with no userId; skipping');
      return;
    }
    try {
      await this.createForMilestone(payload.userId);
      this.logger.log(`Coupon created for milestone for user ${payload.userId}`);
    } catch (error) {
      this.logger.error(`Failed to create coupon for milestone: ${(error as Error)?.message}`);
    }
  }

  /**
   * Create a coupon when user reaches an XLM milestone. Enforces max 5 active coupons per user.
   */
  async createForMilestone(
    userId: string,
    payload?: { specialistType?: string; discount?: number }
  ): Promise<Coupon | null> {
    const activeCount = await this.couponRepository.count({
      where: { userId, status: CouponStatus.ACTIVE, expiresAt: MoreThan(new Date()) },
    });
    if (activeCount >= MAX_ACTIVE_COUPONS_PER_USER) {
      this.logger.warn(
        `User ${userId} already has ${MAX_ACTIVE_COUPONS_PER_USER} active coupons; skipping creation`
      );
      return null;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_COUPON_DAYS_VALID);
    const discount = payload?.discount ?? DEFAULT_DISCOUNT_PERCENT;
    if (!Number.isInteger(discount) || discount < 1 || discount > 100) {
      throw new BadRequestException('Discount must be an integer from 1 to 100');
    }
    const code = await this.generateCouponCode();

    const coupon = this.couponRepository.create({
      userId,
      code,
      discount,
      specialistType: payload?.specialistType ?? undefined,
      expiresAt,
      status: CouponStatus.ACTIVE,
    });
    const saved = await this.saveNewCoupon(coupon);
    await this.auditService.logEvent({
      userRole: 'SYSTEM',
      action: AuditAction.CREATE,
      resourceType: AuditResource.COUPON,
      resourceId: saved.id,
      resourceName: saved.code,
      newValues: {
        userId: saved.userId,
        code: saved.code,
        discount: saved.discount,
        specialistType: saved.specialistType,
        expiresAt: saved.expiresAt.toISOString(),
        status: saved.status,
      },
      description: `Coupon ${saved.code} created for milestone user ${userId}`,
    });
    return saved;
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
    const now = new Date();
    const result = await this.couponRepository
      .createQueryBuilder()
      .update(Coupon)
      .set({ status: CouponStatus.EXPIRED })
      .where('status = :status', { status: CouponStatus.ACTIVE })
      // Quoted because the column is camelCase; Postgres lower-cases unquoted identifiers.
      .andWhere('"expiresAt" <= :now', { now })
      .returning(['id', 'code'])
      .execute();

    const expiredCoupons = (result.raw ?? []) as Array<{
      id: string;
      code: string;
    }>;
    for (const coupon of expiredCoupons) {
      try {
        await this.auditService.logEvent({
          userRole: 'SYSTEM',
          action: AuditAction.UPDATE,
          resourceType: AuditResource.COUPON,
          resourceId: coupon.id,
          resourceName: coupon.code,
          oldValues: { status: CouponStatus.ACTIVE },
          newValues: { status: CouponStatus.EXPIRED },
          description: `Coupon ${coupon.code} expired automatically`,
        });
      } catch (error) {
        // One failed audit write must not stop the rest of the batch.
        this.logger.error(
          `Failed to audit automatic expiry of coupon ${coupon.code}: ${(error as Error)?.message}`
        );
      }
    }

    this.logger.log(`Marked ${result.affected ?? 0} expired coupons as EXPIRED`);
  }

  /**
   * Validate a coupon before confirming a consultation booking.
   * Rate limited: max 10 validation attempts per coupon per hour (Redis counter).
   * Does NOT mark the coupon as used.
   */
  async validate(dto: ValidateCouponDto, currentUserId: string): Promise<ValidateCouponResult> {
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

    if (coupon.status === CouponStatus.EXPIRED || new Date() > coupon.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    if (coupon.userId !== currentUserId) {
      throw new ForbiddenException('Coupon does not belong to the current user');
    }

    return { valid: true };
  }

  /**
   * Admin: Create a new coupon for a specific user
   */
  async createCoupon(
    userId: string,
    payload: {
      code?: string;
      discount?: number;
      specialistType?: string;
      daysValid?: number;
    },
    createdBy: string,
    createdByRole?: string
  ): Promise<Coupon> {
    const discount = payload.discount ?? DEFAULT_DISCOUNT_PERCENT;
    const daysValid = payload.daysValid ?? DEFAULT_COUPON_DAYS_VALID;
    if (!Number.isInteger(discount) || discount < 1 || discount > 100) {
      throw new BadRequestException('Discount must be an integer from 1 to 100');
    }
    if (!Number.isInteger(daysValid) || daysValid < 1 || daysValid > 365) {
      throw new BadRequestException('Validity must be between 1 and 365 days');
    }
    if (payload.specialistType && payload.specialistType.length > 50) {
      throw new BadRequestException('Specialist type must not exceed 50 characters');
    }

    const activeCount = await this.couponRepository.count({
      where: { userId, status: CouponStatus.ACTIVE, expiresAt: MoreThan(new Date()) },
    });
    if (activeCount >= MAX_ACTIVE_COUPONS_PER_USER) {
      throw new BadRequestException(
        `User already has the maximum of ${MAX_ACTIVE_COUPONS_PER_USER} active coupons`
      );
    }

    const expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);
    const code = await this.generateCouponCode(payload.code);

    const coupon = this.couponRepository.create({
      userId,
      code,
      discount,
      specialistType: payload.specialistType ?? undefined,
      expiresAt,
      status: CouponStatus.ACTIVE,
    });
    const saved = await this.saveNewCoupon(coupon);
    this.logger.log(`Coupon created by admin: ${saved.code} for user ${userId}`);
    await this.auditService.logEvent({
      userId: createdBy,
      userRole: createdByRole,
      action: AuditAction.CREATE,
      resourceType: AuditResource.COUPON,
      resourceId: saved.id,
      resourceName: saved.code,
      newValues: {
        userId: saved.userId,
        code: saved.code,
        discount: saved.discount,
        specialistType: saved.specialistType,
        expiresAt: saved.expiresAt.toISOString(),
        status: saved.status,
      },
      description: `Coupon ${saved.code} created for user ${userId}`,
    });
    return saved;
  }

  /**
   * Admin: Bulk create coupons
   */
  async bulkCreateCoupons(
    userIds: string[],
    payload: {
      discount?: number;
      specialistType?: string;
      daysValid?: number;
    },
    createdBy: string,
    createdByRole?: string
  ): Promise<Coupon[]> {
    const coupons: Coupon[] = [];
    for (const userId of userIds) {
      const coupon = await this.createCoupon(userId, payload, createdBy, createdByRole);
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
  async markAsRedeemed(
    couponCode: string,
    redeemedBy: string,
    redeemedByRole?: string
  ): Promise<Coupon> {
    return this.updateStatus(couponCode, CouponStatus.REDEEMED, redeemedBy, redeemedByRole);
  }

  async updateStatus(
    couponCode: string,
    status: CouponStatus,
    updatedBy: string,
    updatedByRole?: string
  ): Promise<Coupon> {
    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await this.couponRepository.findOne({ where: { code: normalizedCode } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    if (coupon.status === status) {
      throw new BadRequestException(`Coupon is already ${status}`);
    }
    if (coupon.status === CouponStatus.REDEEMED) {
      throw new BadRequestException('Redeemed coupons cannot change status');
    }
    if (status === CouponStatus.ACTIVE && coupon.expiresAt <= new Date()) {
      throw new BadRequestException('Cannot activate an expired coupon');
    }
    if (
      status === CouponStatus.REDEEMED &&
      (coupon.status === CouponStatus.EXPIRED || coupon.expiresAt <= new Date())
    ) {
      throw new BadRequestException('Coupon has expired');
    }
    if (status === CouponStatus.ACTIVE) {
      const activeCount = await this.couponRepository.count({
        where: {
          userId: coupon.userId,
          status: CouponStatus.ACTIVE,
          expiresAt: MoreThan(new Date()),
        },
      });
      if (activeCount >= MAX_ACTIVE_COUPONS_PER_USER) {
        throw new BadRequestException(
          `User already has the maximum of ${MAX_ACTIVE_COUPONS_PER_USER} active coupons`
        );
      }
    }

    // Capture the previous values BEFORE mutating the entity so the audit
    // record shows the true "before" state.
    const previousStatus = coupon.status;
    const previousUsedAt = coupon.usedAt;

    coupon.status = status;
    coupon.usedAt = status === CouponStatus.REDEEMED ? new Date() : null;
    const saved = await this.couponRepository.save(coupon);

    await this.auditService.logEvent({
      userId: updatedBy,
      userRole: updatedByRole,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.COUPON,
      resourceId: saved.id,
      resourceName: saved.code,
      oldValues: {
        status: previousStatus,
        usedAt: previousUsedAt?.toISOString() ?? null,
      },
      newValues: { status: saved.status, usedAt: saved.usedAt?.toISOString() ?? null },
      description: `Coupon ${saved.code} status changed from ${previousStatus} to ${saved.status}`,
    });
    this.logger.log(`Coupon status changed: ${normalizedCode} by ${updatedBy}`);
    return saved;
  }

  /**
   * Admin: Extend coupon expiration
   */
  async extendExpiration(
    couponCode: string,
    additionalDays: number,
    updatedBy: string,
    updatedByRole?: string
  ): Promise<Coupon> {
    if (!Number.isInteger(additionalDays) || additionalDays < 1 || additionalDays > 365) {
      throw new BadRequestException('Extension must be between 1 and 365 days');
    }
    const normalizedCode = couponCode.trim().toUpperCase();
    const coupon = await this.couponRepository.findOne({ where: { code: normalizedCode } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    if (coupon.status === CouponStatus.REDEEMED) {
      throw new BadRequestException('Cannot extend expiration of redeemed coupon');
    }

    const oldValues = {
      expiresAt: coupon.expiresAt.toISOString(),
      status: coupon.status,
    };
    coupon.expiresAt = new Date(coupon.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    if (coupon.status === CouponStatus.EXPIRED && coupon.expiresAt > new Date()) {
      const activeCount = await this.couponRepository.count({
        where: {
          userId: coupon.userId,
          status: CouponStatus.ACTIVE,
          expiresAt: MoreThan(new Date()),
        },
      });
      if (activeCount >= MAX_ACTIVE_COUPONS_PER_USER) {
        throw new BadRequestException(
          `User already has the maximum of ${MAX_ACTIVE_COUPONS_PER_USER} active coupons`
        );
      }
      coupon.status = CouponStatus.ACTIVE;
    }
    const saved = await this.couponRepository.save(coupon);

    this.logger.log(`Coupon expiration extended: ${normalizedCode} by ${additionalDays} days`);
    await this.auditService.logEvent({
      userId: updatedBy,
      userRole: updatedByRole,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.COUPON,
      resourceId: saved.id,
      resourceName: saved.code,
      oldValues,
      newValues: {
        expiresAt: saved.expiresAt.toISOString(),
        status: saved.status,
      },
      description: `Coupon ${saved.code} validity extended by ${additionalDays} days`,
    });
    return saved;
  }

  /**
   * Save a newly created coupon, translating database constraint failures
   * into proper HTTP errors instead of a generic 500.
   *  - unique violation on code (two admins creating the same code at once) -> 409
   *  - foreign key violation (userId does not exist) -> 404
   */
  private async saveNewCoupon(coupon: Coupon): Promise<Coupon> {
    try {
      return await this.couponRepository.save(coupon);
    } catch (error) {
      const databaseError = error as {
        code?: string;
        driverError?: { code?: string };
      };
      const dbCode = databaseError.code ?? databaseError.driverError?.code;
      if (dbCode === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Coupon code already exists');
      }
      if (dbCode === PG_FOREIGN_KEY_VIOLATION) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  private async generateCouponCode(requestedCode?: string): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    if (requestedCode) {
      const code = requestedCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(code)) {
        throw new BadRequestException('Coupon code must contain exactly 8 letters or numbers');
      }
      if (await this.couponRepository.findOne({ where: { code } })) {
        throw new ConflictException('Coupon code already exists');
      }
      return code;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 8 }, () => chars[randomInt(chars.length)]).join('');
      if (!(await this.couponRepository.findOne({ where: { code } }))) {
        return code;
      }
    }
    throw new ConflictException('Could not generate a unique coupon code');
  }
}
