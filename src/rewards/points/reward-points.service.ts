import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { RewardPointRule } from './entities/reward-point-rule.entity';
import { RewardPointsLedger } from './entities/reward-points-ledger.entity';
import { RewardPointRedemption } from './entities/reward-point-redemption.entity';
import {
  RewardCatalog,
  RewardCatalogStatus,
  RewardType,
} from '../entities/reward-catalog.entity';
import { CreateRewardPointRuleDto } from './dto/create-reward-point-rule.dto';
import { UpdateRewardPointRuleDto } from './dto/update-reward-point-rule.dto';

const UNIQUE_VIOLATION_CODE = '23505';
const REDEMPTION_ACTION = 'reward.redeemed';
const UNLIMITED_STOCK = -1;

interface LedgerEntryInput {
  userId: string;
  delta: number;
  action: string;
  eventRef: string;
  reason?: string | null;
}

export interface PointsRedemptionResult {
  success: boolean;
  redemptionId: string;
  catalogItemId: string;
  title: string;
  pointsSpent: number;
  balanceAfter: number;
}

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; driverError?: { code?: string } };
  return (
    err?.code === UNIQUE_VIOLATION_CODE ||
    err?.driverError?.code === UNIQUE_VIOLATION_CODE
  );
}

/**
 * Reward points subdomain: admin-managed point rules, an append-only points
 * ledger, points balance/history reads, and points-based catalog redemption.
 * All balance mutations run inside a single transaction guarded by a
 * per-user Postgres advisory lock and a unique (userId, eventRef) index so
 * replayed or concurrent events can never double-credit or double-spend.
 */
@Injectable()
export class RewardPointsService {
  private readonly logger = new Logger(RewardPointsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Admin: list all point rules regardless of active state.
   */
  async listRules(): Promise<RewardPointRule[]> {
    return this.dataSource.getRepository(RewardPointRule).find({
      order: { action: 'ASC' },
    });
  }

  /**
   * Public: list only active point rules.
   */
  async listActiveRules(): Promise<RewardPointRule[]> {
    return this.dataSource.getRepository(RewardPointRule).find({
      where: { active: true },
      order: { action: 'ASC' },
    });
  }

  /**
   * Admin: fetch a single rule by id.
   */
  async getRule(id: string): Promise<RewardPointRule> {
    const rule = await this.dataSource
      .getRepository(RewardPointRule)
      .findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Reward point rule '${id}' not found`);
    }
    return rule;
  }

  /**
   * Admin: create a point rule. Action keys are unique.
   */
  async createRule(dto: CreateRewardPointRuleDto): Promise<RewardPointRule> {
    const repo = this.dataSource.getRepository(RewardPointRule);
    try {
      return await repo.save(
        repo.create({
          action: dto.action,
          points: dto.points,
          active: dto.active ?? true,
          description: dto.description ?? null,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A reward point rule for action '${dto.action}' already exists`,
        );
      }
      throw error;
    }
  }

  /**
   * Admin: update a point rule. Conflicting action renames are rejected.
   */
  async updateRule(
    id: string,
    dto: UpdateRewardPointRuleDto,
  ): Promise<RewardPointRule> {
    const repo = this.dataSource.getRepository(RewardPointRule);
    const rule = await repo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Reward point rule '${id}' not found`);
    }
    if (dto.action !== undefined) rule.action = dto.action;
    if (dto.points !== undefined) rule.points = dto.points;
    if (dto.active !== undefined) rule.active = dto.active;
    if (dto.description !== undefined) rule.description = dto.description;
    try {
      return await repo.save(rule);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A reward point rule for action '${rule.action}' already exists`,
        );
      }
      throw error;
    }
  }

  /**
   * Admin: delete a point rule.
   */
  async deleteRule(id: string): Promise<void> {
    const repo = this.dataSource.getRepository(RewardPointRule);
    const rule = await repo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException(`Reward point rule '${id}' not found`);
    }
    await repo.remove(rule);
  }

  /**
   * Current point balance for a user, derived from the ledger.
   */
  async getBalance(
    userId: string,
  ): Promise<{ userId: string; balance: number }> {
    const balance = await this.currentBalance(this.dataSource, userId);
    return { userId, balance };
  }

  /**
   * User: paginated ledger history, newest first. Append-only — entries are
   * never mutated.
   */
  async getLedger(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{
    data: RewardPointsLedger[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const [data, total] = await this.dataSource
      .getRepository(RewardPointsLedger)
      .findAndCount({
        where: { userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Award points for an eligible event using the active rule for `action`.
   * Idempotent per (userId, eventRef): replayed events return the existing
   * ledger entry instead of crediting twice.
   */
  async awardPoints(
    userId: string,
    action: string,
    eventRef: string,
    reason?: string,
  ): Promise<RewardPointsLedger> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const rule = await manager.getRepository(RewardPointRule).findOne({
        where: { action, active: true },
      });
      if (!rule) {
        throw new NotFoundException(
          `No active reward point rule configured for action '${action}'`,
        );
      }
      const entry = await this.insertLedgerEntry(manager, {
        userId,
        delta: rule.points,
        action,
        eventRef,
        reason: reason ?? null,
      });
      this.logger.log(
        `Awarded ${rule.points} points to user ${userId} for ${action} (${eventRef})`,
      );
      return entry;
    });
  }

  /**
   * Spend points for a debit action. Requires sufficient balance; idempotent
   * per (userId, eventRef) like awardPoints.
   */
  async spendPoints(
    userId: string,
    action: string,
    eventRef: string,
    amount: number,
  ): Promise<RewardPointsLedger> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }
    return this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const balance = await this.currentBalance(manager, userId);
      if (balance < amount) {
        throw new BadRequestException(
          `INSUFFICIENT_POINTS: balance ${balance} is lower than requested ${amount}`,
        );
      }
      const entry = await this.insertLedgerEntry(manager, {
        userId,
        delta: -amount,
        action,
        eventRef,
        reason: null,
      });
      this.logger.log(
        `Spent ${amount} points of user ${userId} for ${action} (${eventRef})`,
      );
      return entry;
    });
  }

  /**
   * Redeem a CREDITS catalog item by spending points. Validates availability
   * and balance, deducts points, decrements stock, and records the claim in
   * one transaction; emits `reward.redeemed` after commit.
   */
  async redeemPoints(
    userId: string,
    catalogItemId: string,
  ): Promise<PointsRedemptionResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const catalogRepo = manager.getRepository(RewardCatalog);
      const item = await catalogRepo.findOne({
        where: { id: catalogItemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException(`Reward catalog item '${catalogItemId}' not found`);
      }
      if (item.status !== RewardCatalogStatus.ACTIVE) {
        throw new BadRequestException(
          'Reward is not available for redemption',
        );
      }
      if (item.type !== RewardType.CREDITS) {
        throw new BadRequestException(
          'Only CREDITS rewards can be redeemed with reward points',
        );
      }
      const pointsCost = Math.round(Number(item.cost));
      if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
        throw new BadRequestException('Reward has an invalid point cost');
      }
      if (item.stock !== UNLIMITED_STOCK && item.stock <= 0) {
        throw new BadRequestException(
          'OUT_OF_STOCK: reward is currently out of stock',
        );
      }
      const balance = await this.currentBalance(manager, userId);
      if (balance < pointsCost) {
        throw new BadRequestException(
          `INSUFFICIENT_POINTS: balance ${balance} is lower than reward cost ${pointsCost}`,
        );
      }

      const redemptionRepo = manager.getRepository(RewardPointRedemption);
      const redemption = await redemptionRepo.save(
        redemptionRepo.create({
          userId,
          catalogItemId,
          pointsSpent: pointsCost,
          status: 'COMPLETED',
        }),
      );

      await this.insertLedgerEntry(manager, {
        userId,
        delta: -pointsCost,
        action: REDEMPTION_ACTION,
        eventRef: redemption.id,
        reason: `Redeemed '${item.title}' (${catalogItemId})`,
      });

      if (item.stock !== UNLIMITED_STOCK) {
        item.stock -= 1;
      }
      item.redeemedCount += 1;
      await catalogRepo.save(item);

      return {
        redemption,
        title: item.title,
        balanceAfter: balance - pointsCost,
      };
    });

    this.eventEmitter.emit('reward.redeemed', {
      userId,
      catalogItemId,
      pointsSpent: result.redemption.pointsSpent,
      redemptionId: result.redemption.id,
    });
    this.logger.log(
      `Redeemed catalog item ${catalogItemId} for ${result.redemption.pointsSpent} points by user ${userId}`,
    );

    return {
      success: true,
      redemptionId: result.redemption.id,
      catalogItemId,
      title: result.title,
      pointsSpent: result.redemption.pointsSpent,
      balanceAfter: result.balanceAfter,
    };
  }

  /**
   * Serialize point mutations per user so balance computation and the
   * unique (userId, eventRef) insert are race-free across transactions.
   */
  private async lockUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`reward-points:${userId}`],
    );
  }

  private async currentBalance(
    q: EntityManager | DataSource,
    userId: string,
  ): Promise<number> {
    const rows = await q.query(
      `SELECT COALESCE(SUM("delta"), 0)::int AS balance
       FROM reward_points_ledger
       WHERE "userId" = $1`,
      [userId],
    );
    return Number(rows?.[0]?.balance ?? 0);
  }

  /**
   * Insert a ledger row with balanceAfter derived inside the same
   * transaction. A unique (userId, eventRef) conflict is rolled back to a
   * savepoint and resolved by returning the already-recorded entry.
   */
  private async insertLedgerEntry(
    manager: EntityManager,
    entry: LedgerEntryInput,
  ): Promise<RewardPointsLedger> {
    await manager.query('SAVEPOINT ledger_entry_insert');
    try {
      await manager.query(
        `INSERT INTO reward_points_ledger ("userId", delta, "balanceAfter", action, "eventRef", reason)
         SELECT $1, $2,
                COALESCE((SELECT SUM(delta) FROM reward_points_ledger WHERE "userId" = $1), 0) + $2,
                $3, $4, $5
         RETURNING id`,
        [
          entry.userId,
          entry.delta,
          entry.action,
          entry.eventRef,
          entry.reason ?? null,
        ],
      );
      await manager.query('RELEASE SAVEPOINT ledger_entry_insert');
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      await manager.query('ROLLBACK TO SAVEPOINT ledger_entry_insert');
    }
    const existing = await manager.getRepository(RewardPointsLedger).find({
      where: { userId: entry.userId, eventRef: entry.eventRef },
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (!existing.length) {
      throw new BadRequestException(
        'Failed to record reward points ledger entry',
      );
    }
    return existing[0];
  }
}
