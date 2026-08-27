import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { RewardStatus } from './enums/reward-status.enum';
import { PayoutHistoryQueryDto } from './dto/payout-history-query.dto';
import { RewardSummaryResponseDto } from './dto/reward-history.dto';

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);

  constructor(
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Fetches paginated reward history for a user with optional filters
   */
  async getRewardHistory(userId: string, query: PayoutHistoryQueryDto) {
    const { page = 1, limit = 20, startDate, endDate, status, categoryId } = query;
    
    // Cache key includes query params for granularity
    const cacheKey = `reward_history:${userId}:${JSON.stringify(query)}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const queryBuilder = this.rewardRepo.createQueryBuilder('reward_transaction')
      .leftJoinAndSelect('reward_transaction.task_completion', 'task_completion')
      .leftJoinAndSelect('task_completion.health_task', 'health_task')
      .where('reward_transaction.userId = :userId', { userId });

    // Dynamic Filtering
    if (startDate) {
      queryBuilder.andWhere('reward_transaction.createdAt >= :startDate', { startDate: new Date(startDate) });
    }
    if (endDate) {
      queryBuilder.andWhere('reward_transaction.createdAt <= :endDate', { endDate: new Date(endDate) });
    }
    if (status) {
      queryBuilder.andWhere('reward_transaction.status = :status', { status });
    }
    if (categoryId) {
      queryBuilder.andWhere('health_task.categoryId = :categoryId', { categoryId });
    }

    // Pagination and Sorting
    queryBuilder
      .orderBy('reward_transaction.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    const data = transactions.map(tx => ({
      id: tx.id,
      amount: tx.amount,
      status: tx.status,
      createdAt: tx.createdAt,
      // Mask transaction hash if not successful to prevent confusion
      stellarTxHash: tx.status === RewardStatus.SUCCESS ? tx.stellarTxHash : undefined,
      taskTitle: tx.task_completion?.health_task?.title || 'Unknown Task',
    }));

    const result = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await this.cacheManager.set(cacheKey, result, 120000); // 2 minute cache
    return result;
  }

  /**
   * Returns reward summary totals for a user.
   */
  async getRewardSummary(userId: string): Promise<RewardSummaryResponseDto> {
    const cacheKey = `reward_summary:${userId}`;
    const cached = await this.cacheManager.get<RewardSummaryResponseDto>(cacheKey);
    if (cached) return cached;

    const summary = await this.rewardRepo
      .createQueryBuilder('reward_transaction')
      .select(
        "COALESCE(SUM(CASE WHEN reward_transaction.status = :successStatus THEN reward_transaction.amount ELSE 0 END), 0)",
        'totalEarned',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN reward_transaction.status = :pendingStatus THEN reward_transaction.amount ELSE 0 END), 0)",
        'totalPending',
      )
      .addSelect('MAX(reward_transaction.createdAt)', 'lastRewardDate')
      .where('reward_transaction.userId = :userId', { userId })
      .setParameters({
        successStatus: RewardStatus.SUCCESS,
        pendingStatus: RewardStatus.PENDING,
      })
      .getRawOne<{
        totalEarned: string | null;
        totalPending: string | null;
        lastRewardDate: string | null;
      }>();

    const result: RewardSummaryResponseDto = {
      totalEarned: Number(summary?.totalEarned ?? 0),
      totalPending: Number(summary?.totalPending ?? 0),
      lastRewardDate: summary?.lastRewardDate ?? null,
    };

    await this.cacheManager.set(cacheKey, result, 120000);
    return result;
  }
}