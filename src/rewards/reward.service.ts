import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RewardHistoryQueryDto, RewardHistoryResponseDto, RewardHistoryItemDto } from './dto/reward-history.dto';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { TaskCompletion } from '../task-completion/entities/task-completion.entity';
import { HealthTask } from '../entities/health-task.entity';

@Injectable()
export class RewardService {
  constructor(
    @InjectRepository(RewardTransaction)
    private readonly rewardTransactionRepository: Repository<RewardTransaction>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly healthTaskRepository: Repository<HealthTask>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getRewardHistory(
    userId: string,
    queryDto: RewardHistoryQueryDto,
  ): Promise<RewardHistoryResponseDto> {
    const { page = 1, limit = 20, startDate, endDate, categoryId } = queryDto;
    const skip = (page - 1) * limit;

    // Create cache key
    const cacheKey = `reward_history:${userId}:${JSON.stringify(queryDto)}`;
    
    // Try to get from cache first
    const cachedResult = await this.cacheManager.get<RewardHistoryResponseDto>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Build query with joins
    const queryBuilder = this.rewardTransactionRepository
      .createQueryBuilder('reward_transaction')
      .leftJoinAndSelect('reward_transaction.task_completion', 'task_completion')
      .leftJoinAndSelect('task_completion.health_task', 'health_task')
      .where('reward_transaction.userId = :userId', { userId })
      .orderBy('reward_transaction.createdAt', 'DESC');

    // Apply date filters
    if (startDate) {
      queryBuilder.andWhere('reward_transaction.createdAt >= :startDate', { 
        startDate: new Date(startDate) 
      });
    }

    if (endDate) {
      queryBuilder.andWhere('reward_transaction.createdAt <= :endDate', { 
        endDate: new Date(endDate) 
      });
    }

    // Apply category filter
    if (categoryId) {
      queryBuilder.andWhere('health_task.categoryId = :categoryId', { categoryId });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const rewardTransactions = await queryBuilder
      .skip(skip)
      .take(limit)
      .getMany();

    // Transform to DTO format
    const data: RewardHistoryItemDto[] = rewardTransactions.map(transaction => ({
      id: transaction.id,
      amount: transaction.amount,
      status: transaction.status,
      stellarTxHash: transaction.status === 'COMPLETED' ? transaction.stellarTxHash : undefined,
      taskTitle: transaction.task_completion?.health_task?.title || 'Unknown Task',
      categoryId: transaction.task_completion?.health_task?.categoryId,
      createdAt: transaction.createdAt,
    }));

    const result: RewardHistoryResponseDto = {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    // Cache the result for 2 minutes (120 seconds)
    await this.cacheManager.set(cacheKey, result, 120000);

    return result;
  }
}
