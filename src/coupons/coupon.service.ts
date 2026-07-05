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

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);
  private redisClient: Redis | null = null;

  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findExpiringWithinHours(hours: number): Promise<Coupon[]> {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.couponRepository.find({
      where: {
        status: CouponStatus.ACTIVE,
        expiresAt: { $lte: expiryDate, $gte: now } as any,
      },
    });
  }

  async validateCoupon(dto: ValidateCouponDto, userId?: string): Promise<ValidateCouponResult> {
    const coupon = await this.couponRepository.findOne({ where: { code: dto.code } });
    if (!coupon) {
      return { valid: false, reason: 'Coupon not found' };
    }
    if (coupon.status !== CouponStatus.ACTIVE) {
      return { valid: false, reason: 'Coupon is not active' };
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return { valid: false, reason: 'Coupon has expired' };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, reason: 'Coupon usage limit reached' };
    }
    return { valid: true };
  }
}