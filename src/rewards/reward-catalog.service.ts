import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RewardCatalog, RewardType, RewardCatalogStatus } from './entities/reward-catalog.entity';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { User } from '../entities/user.entity';
import { WalletService } from '../modules/wallet/wallet.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../audit/entities/audit-log.entity';

export class CreateRewardCatalogDto {
  @ApiProperty({ description: 'Reward title shown to users', maxLength: 100, example: 'Stellar Tote Bag' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ description: 'Long-form reward description', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: RewardType, description: 'Reward fulfillment type' })
  @IsEnum(RewardType)
  type: RewardType;

  @ApiProperty({ description: 'Redemption cost (integer, >= 0)', minimum: 0, example: 25 })
  @IsInt()
  @Min(0)
  cost: number;

  @ApiProperty({ description: 'Units available for redemption (integer, >= 0)', minimum: 0, example: 10 })
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional({ enum: RewardCatalogStatus, description: 'Initial status; defaults to ACTIVE' })
  @IsOptional()
  @IsEnum(RewardCatalogStatus)
  status?: RewardCatalogStatus;

  @ApiPropertyOptional({ description: 'Free-form metadata (coupon template, badge image URL, ...)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Expiry instant in ISO 8601 (UTC); omit for no expiry',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateRewardCatalogDto {
  @ApiPropertyOptional({ description: 'Reward title', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Long-form reward description', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Redemption cost (integer, >= 0)', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ description: 'Stock on hand (integer, >= 0)', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ enum: RewardCatalogStatus, description: 'Catalog status' })
  @IsOptional()
  @IsEnum(RewardCatalogStatus)
  status?: RewardCatalogStatus;

  @ApiPropertyOptional({ description: 'Free-form metadata (replaces the previous value when provided)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Expiry instant in ISO 8601 (UTC), or null to clear the expiry',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class RedeemRewardDto {
  @ApiProperty({ description: 'UUID of the catalog reward to redeem', format: 'uuid' })
  @IsUUID()
  rewardId: string;
}

export class CatalogAdminQueryDto {
  @ApiPropertyOptional({ enum: RewardCatalogStatus, description: 'Filter by status; omitted means all statuses' })
  @IsOptional()
  @IsEnum(RewardCatalogStatus)
  status?: RewardCatalogStatus;

  @ApiPropertyOptional({ enum: RewardType, description: 'Filter by reward type' })
  @IsOptional()
  @IsEnum(RewardType)
  type?: RewardType;

  @ApiPropertyOptional({ description: '1-based page number', minimum: 1, default: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size (1-100)', minimum: 1, maximum: 100, default: 20, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class LowStockQueryDto {
  @ApiPropertyOptional({
    description: 'Return rewards whose stock is at or below this level',
    minimum: 0,
    default: 5,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  threshold?: number = 5;
}

/** Authenticated actor behind a catalog mutation; recorded on audit entries. */
export interface CatalogActor {
  userId?: string;
  userRole?: string;
}

export interface CatalogPage {
  data: Array<RewardCatalog & { isExpired: boolean }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RedemptionResult {
  success: boolean;
  message: string;
  reward?: RewardCatalog;
  newBalance?: number;
  transactionId?: string;
}

@Injectable()
export class RewardCatalogService {
  private readonly logger = new Logger(RewardCatalogService.name);

  constructor(
    @InjectRepository(RewardCatalog)
    private readonly catalogRepo: Repository<RewardCatalog>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletService: WalletService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Admin: create a reward catalog entry and audit the change.
   */
  async create(dto: CreateRewardCatalogDto, actor?: CatalogActor): Promise<RewardCatalog> {
    const reward = this.catalogRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      type: dto.type,
      cost: dto.cost,
      stock: dto.stock,
      status: dto.status ?? RewardCatalogStatus.ACTIVE,
      metadata: dto.metadata ?? null,
      redeemedCount: 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    const saved = await this.catalogRepo.save(reward);
    this.logger.log(`Reward catalog created: ${saved.id} - ${saved.title}`);
    await this.audit(
      actor,
      AuditAction.CREATE,
      saved.id,
      `Created reward catalog entry "${saved.title}" (cost ${saved.cost}, stock ${saved.stock})`,
    );
    this.emitStockChanged(saved, actor?.userId);
    return saved;
  }

  /**
   * Admin: update a reward catalog entry and audit the change.
   * Fields absent from the DTO are left untouched; `expiresAt: null` clears
   * the expiry.
   */
  async update(id: string, dto: UpdateRewardCatalogDto, actor?: CatalogActor): Promise<RewardCatalog> {
    const reward = await this.catalogRepo.findOne({ where: { id } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        changes[key] = value;
      }
    }
    if (typeof changes.expiresAt === 'string') {
      changes.expiresAt = new Date(changes.expiresAt);
    }

    const previousStock = reward.stock;
    Object.assign(reward, changes);
    const saved = await this.catalogRepo.save(reward);
    this.logger.log(`Reward catalog updated: ${saved.id}`);
    await this.audit(
      actor,
      AuditAction.UPDATE,
      saved.id,
      `Updated reward catalog entry "${saved.title}"`,
      changes,
    );
    if (dto.stock !== undefined && saved.stock !== previousStock) {
      this.emitStockChanged(saved, actor?.userId);
    }
    return saved;
  }

  /**
   * Admin: soft-delete a reward catalog entry by archiving it and auditing the
   * change. Rows are never hard-deleted so historical redemptions keep their
   * references.
   */
  async delete(id: string, actor?: CatalogActor): Promise<void> {
    const reward = await this.catalogRepo.findOne({ where: { id } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    reward.status = RewardCatalogStatus.ARCHIVED;
    await this.catalogRepo.save(reward);
    this.logger.log(`Reward catalog archived: ${id}`);
    await this.audit(
      actor,
      AuditAction.DELETE,
      id,
      `Archived reward catalog entry "${reward.title}" (soft delete)`,
    );
  }

  /**
   * Admin: paginated list of every catalog entry (including inactive and
   * expired ones) with a computed `isExpired` flag per row.
   */
  async findAll(
    status?: RewardCatalogStatus,
    type?: RewardType,
    page: number = 1,
    limit: number = 20,
  ): Promise<CatalogPage> {
    const qb = this.catalogRepo.createQueryBuilder('rc');

    if (status) {
      qb.andWhere('rc.status = :status', { status });
    }
    if (type) {
      qb.andWhere('rc.type = :type', { type });
    }

    qb.orderBy('rc.createdAt', 'DESC');
    const pageNum = this.toPositiveInt(page, 1);
    const limitNum = Math.min(this.toPositiveInt(limit, 20), 100);
    qb.skip((pageNum - 1) * limitNum).take(limitNum);

    const [rows, total] = await qb.getManyAndCount();
    const now = Date.now();
    return {
      data: rows.map((row) => ({ ...row, isExpired: this.isExpired(row, now) })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /**
   * Admin: get a single reward by ID.
   */
  async findOne(id: string): Promise<RewardCatalog> {
    const reward = await this.catalogRepo.findOne({ where: { id } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }
    return reward;
  }

  /**
   * Admin: rewards with finite stock at or below `threshold`.
   * Unlimited-stock rewards (`stock = -1`) are excluded.
   */
  async getLowStock(threshold: number = 5): Promise<RewardCatalog[]> {
    const parsed = Math.floor(Number(threshold));
    const level = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
    return this.catalogRepo
      .createQueryBuilder('rc')
      .where('rc.stock >= 0 AND rc.stock <= :level', { level })
      .orderBy('rc.stock', 'ASC')
      .addOrderBy('rc.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Public: ACTIVE rewards that have not expired, with current stock levels.
   * Expiry is evaluated in UTC against `NOW()`.
   */
  async getPublicCatalog(): Promise<RewardCatalog[]> {
    return this.catalogRepo
      .createQueryBuilder('rc')
      .where('rc.status = :status', { status: RewardCatalogStatus.ACTIVE })
      .andWhere('(rc.expiresAt IS NULL OR rc.expiresAt > NOW())')
      .orderBy('rc.cost', 'ASC')
      .getMany();
  }

  /**
   * Authenticated user: ACTIVE, non-expired rewards available for redemption.
   */
  async getAvailableRewards(): Promise<RewardCatalog[]> {
    return this.getPublicCatalog();
  }

  /**
   * Atomically reserve `qty` units of catalog stock for a claim.
   *
   * The catalog row is locked with `pessimistic_write` inside a transaction so
   * concurrent claims serialize on the row and stock never drops below zero.
   * A stock of `-1` means unlimited and is never decremented. Disabled or
   * expired rewards cannot be newly reserved.
   *
   * @returns the refreshed catalog row
   * @throws BadRequestException `OUT_OF_STOCK` when stock is insufficient
   * @throws BadRequestException `REWARD_EXPIRED` when the reward already expired
   */
  async reserveStock(catalogId: string, qty = 1, changedBy?: string): Promise<RewardCatalog> {
    return this.mutateStock(catalogId, qty, 'reserve', changedBy);
  }

  /**
   * Atomically return previously reserved `qty` units to catalog stock
   * (e.g. when a claim fails after its reservation).
   */
  async releaseStock(catalogId: string, qty = 1, changedBy?: string): Promise<RewardCatalog> {
    return this.mutateStock(catalogId, qty, 'release', changedBy);
  }

  /**
   * User: redeem a reward using the wallet balance, decrementing stock in the
   * same locked transaction as the redemption record.
   */
  async redeem(userId: string, dto: RedeemRewardDto): Promise<RedemptionResult> {
    const reward = await this.catalogRepo.findOne({ where: { id: dto.rewardId } });
    if (!reward) {
      throw new NotFoundException('Reward not found');
    }

    if (reward.status !== RewardCatalogStatus.ACTIVE) {
      throw new BadRequestException('Reward is not available for redemption');
    }

    if (this.isExpired(reward)) {
      throw new BadRequestException('REWARD_EXPIRED');
    }

    if (reward.stock !== -1 && reward.stock <= 0) {
      throw new BadRequestException('OUT_OF_STOCK');
    }

    // Check user's wallet balance
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // For XLM rewards, check wallet balance
    if (reward.type === RewardType.XLM) {
      const walletSummary = await this.walletService.getWalletSummary(userId);
      if (!walletSummary.walletLinked) {
        throw new BadRequestException('No wallet linked. Please link a Stellar wallet first.');
      }

      const liveBalance = parseFloat(walletSummary.liveBalance);
      const minReserve = 0.5;
      const availableBalance = liveBalance - minReserve;

      if (availableBalance < reward.cost) {
        throw new BadRequestException(
          `Insufficient XLM balance. Required: ${reward.cost} XLM, Available: ${availableBalance.toFixed(7)} XLM`,
        );
      }
    }

    const redemption = await this.dataSource.transaction(async (manager) => {
      const rewards = manager.getRepository(RewardCatalog);
      const rewardTransactions = manager.getRepository(RewardTransaction);
      const users = manager.getRepository(User);
      const lockedReward = await rewards.findOne({
        where: { id: dto.rewardId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedReward) {
        throw new NotFoundException('Reward not found');
      }
      if (lockedReward.status !== RewardCatalogStatus.ACTIVE) {
        throw new BadRequestException('Reward is no longer available for redemption');
      }
      if (this.isExpired(lockedReward)) {
        throw new BadRequestException('REWARD_EXPIRED');
      }
      if (lockedReward.stock !== -1 && lockedReward.stock <= 0) {
        throw new BadRequestException('OUT_OF_STOCK');
      }

      const lockedUser = await users.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedUser) {
        throw new NotFoundException('User not found');
      }

      const transaction = rewardTransactions.create({
        userId,
        amount: lockedReward.cost,
        currency: 'XLM',
        status: 'SUCCESS',
        metadata: {
          rewardCatalogId: lockedReward.id,
          rewardTitle: lockedReward.title,
          rewardType: lockedReward.type,
        },
      });
      await rewardTransactions.save(transaction);

      if (lockedReward.type === RewardType.XLM) {
        lockedUser.walletBalance = parseFloat(
          (lockedUser.walletBalance - lockedReward.cost).toFixed(7),
        );
        await users.save(lockedUser);
      }

      if (lockedReward.stock !== -1) {
        lockedReward.stock -= 1;
      }
      lockedReward.redeemedCount += 1;
      await rewards.save(lockedReward);

      return { reward: lockedReward, transaction, user: lockedUser };
    });
    const { reward: redeemedReward, transaction, user: redeemedUser } = redemption;

    // Emit event
    this.eventEmitter.emit('reward.redeemed', {
      userId,
      rewardId: redeemedReward.id,
      rewardTitle: redeemedReward.title,
      transactionId: transaction.id,
      cost: redeemedReward.cost,
    });
    if (redeemedReward.stock !== -1) {
      this.emitStockChanged(redeemedReward, userId);
    }

    this.logger.log(`Reward redeemed: ${redeemedReward.id} by user ${userId}`);

    return {
      success: true,
      message: 'Reward redeemed successfully',
      reward: redeemedReward,
      newBalance: redeemedUser.walletBalance,
      transactionId: transaction.id,
    };
  }

  /**
   * Admin: get reward analytics.
   */
  async getAnalytics(): Promise<any> {
    const totalRewards = await this.catalogRepo.count();
    const activeRewards = await this.catalogRepo.count({
      where: { status: RewardCatalogStatus.ACTIVE },
    });
    const totalRedeemed = await this.catalogRepo
      .createQueryBuilder('rc')
      .select('SUM(rc.redeemedCount)', 'total')
      .getRawOne();

    const byType = await this.catalogRepo
      .createQueryBuilder('rc')
      .select('rc.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(rc.redeemedCount)', 'totalRedeemed')
      .groupBy('rc.type')
      .getRawMany();

    const byStatus = await this.catalogRepo
      .createQueryBuilder('rc')
      .select('rc.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('rc.status')
      .getRawMany();

    const topRedeemed = await this.catalogRepo
      .createQueryBuilder('rc')
      .orderBy('rc.redeemedCount', 'DESC')
      .take(10)
      .getMany();

    return {
      summary: {
        totalRewards,
        activeRewards,
        totalRedemptions: parseInt(totalRedeemed?.total || '0'),
      },
      byType,
      byStatus,
      topRedeemed: topRedeemed.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        cost: r.cost,
        redeemedCount: r.redeemedCount,
        stock: r.stock,
      })),
    };
  }

  /**
   * Lock the catalog row and apply a stock reservation or release in a single
   * transaction, then announce the committed change.
   */
  private async mutateStock(
    catalogId: string,
    qty: number,
    mode: 'reserve' | 'release',
    changedBy?: string,
  ): Promise<RewardCatalog> {
    if (!Number.isInteger(qty) || qty < 1) {
      throw new BadRequestException('Quantity must be a positive integer');
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const rewards = manager.getRepository(RewardCatalog);
      const reward = await rewards.findOne({
        where: { id: catalogId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!reward) {
        throw new NotFoundException('Reward not found');
      }

      if (mode === 'reserve') {
        if (reward.status !== RewardCatalogStatus.ACTIVE) {
          throw new BadRequestException('Reward is not available for redemption');
        }
        if (this.isExpired(reward)) {
          throw new BadRequestException('REWARD_EXPIRED');
        }
        if (reward.stock !== -1) {
          if (reward.stock - qty < 0) {
            throw new BadRequestException('OUT_OF_STOCK');
          }
          reward.stock -= qty;
        }
      } else if (reward.stock !== -1) {
        reward.stock += qty;
      }

      return rewards.save(reward);
    });

    if (updated.stock !== -1) {
      this.emitStockChanged(updated, changedBy);
    }
    return updated;
  }

  /**
   * Expiry rule: a reward is expired when `expiresAt` is set and is no longer
   * in the future. The instant is stored as `timestamptz` and compared in UTC,
   * so the rule does not depend on any local time zone.
   */
  private isExpired(reward: Pick<RewardCatalog, 'expiresAt'>, now = Date.now()): boolean {
    if (reward.expiresAt == null) {
      return false;
    }
    return reward.expiresAt.getTime() <= now;
  }

  /** Announces a committed inventory change to downstream listeners. */
  private emitStockChanged(reward: RewardCatalog, changedBy?: string): void {
    this.eventEmitter.emit('reward.catalog.stock_changed', {
      catalogId: reward.id,
      stock: reward.stock,
      changedBy,
    });
  }

  /** Writes an immutable audit entry for a catalog mutation. */
  private async audit(
    actor: CatalogActor | undefined,
    action: AuditAction,
    resourceId: string,
    description: string,
    newValues?: Record<string, any>,
  ): Promise<void> {
    await this.auditService.logEvent({
      userId: actor?.userId,
      userRole: actor?.userRole,
      action,
      resourceType: AuditResource.REWARD,
      resourceId,
      description,
      newValues,
    });
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
  }
}
