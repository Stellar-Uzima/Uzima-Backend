import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TaskCompletion,
  TaskCompletionStatus,
} from '../../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../../../rewards/enums/reward-status.enum';
import { Coupon } from '../../../coupons/entities/coupon.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';

export type ActivityFeedType = 'task_completed' | 'reward_earned' | 'badge_earned';

export interface ActivityFeedItem {
  id: string;
  type: ActivityFeedType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

@Injectable()
export class ActivityFeedService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepo: Repository<TaskCompletion>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
  ) {}

  async getActivityFeed(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponseDto<ActivityFeedItem>> {
    const [tasks, rewards, badges] = await Promise.all([
      this.fetchCompletedTasks(userId),
      this.fetchEarnedRewards(userId),
      this.fetchEarnedBadges(userId),
    ]);

    const merged = [...tasks, ...rewards, ...badges].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );

    const total = merged.length;
    const offset = (page - 1) * limit;
    const data = merged.slice(offset, offset + limit);

    return new PaginatedResponseDto(data, total, page, limit);
  }

  private async fetchCompletedTasks(userId: string): Promise<ActivityFeedItem[]> {
    const completions = await this.taskCompletionRepo.find({
      where: {
        user: { id: userId },
        status: TaskCompletionStatus.VERIFIED,
      },
      relations: ['task'],
      order: { completedAt: 'DESC' },
    });

    return completions.map((completion) => ({
      id: `task-${completion.id}`,
      type: 'task_completed' as const,
      title: completion.task?.title ?? 'Health task completed',
      description: `Completed task: ${completion.task?.title ?? 'Health task'}`,
      metadata: {
        taskId: completion.task?.id,
        xlmRewarded: Number(completion.xlmRewarded),
      },
      occurredAt: completion.completedAt,
    }));
  }

  private async fetchEarnedRewards(userId: string): Promise<ActivityFeedItem[]> {
    const rewards = await this.rewardRepo.find({
      where: { userId, status: RewardStatus.SUCCESS },
      order: { createdAt: 'DESC' },
    });

    return rewards.map((reward) => ({
      id: `reward-${reward.id}`,
      type: 'reward_earned' as const,
      title: 'XLM reward earned',
      description: `Earned ${Number(reward.amount)} XLM`,
      metadata: {
        amount: Number(reward.amount),
        taskCompletionId: reward.taskCompletionId,
        stellarTxHash: reward.stellarTxHash,
      },
      occurredAt: reward.createdAt,
    }));
  }

  private async fetchEarnedBadges(userId: string): Promise<ActivityFeedItem[]> {
    const coupons = await this.couponRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return coupons.map((coupon) => ({
      id: `badge-${coupon.id}`,
      type: 'badge_earned' as const,
      title: 'Milestone badge earned',
      description: `Unlocked milestone reward (${coupon.discount}% specialist discount)`,
      metadata: {
        couponCode: coupon.code,
        specialistType: coupon.specialistType,
        discount: coupon.discount,
      },
      occurredAt: coupon.createdAt,
    }));
  }
}
