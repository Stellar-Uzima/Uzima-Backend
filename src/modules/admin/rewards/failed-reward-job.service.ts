import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FailedRewardJob } from '../../../rewards/entities/failed-reward-job.entity';
import { Reward } from '../../../rewards/entities/reward.entity';
import { StreakMilestone } from '../../../rewards/entities/streak-milestone.entity';
import { DeadLetterProcessor } from '../../../rewards/queues/dead-letter.processor';
import {
  ListFailedJobsDto,
  ListFailedJobsResponseDto,
  ReplayFailedJobResponseDto,
} from './dto/failed-reward-job.dto';

@Injectable()
export class FailedRewardJobService {
  private readonly logger = new Logger(FailedRewardJobService.name);

  constructor(
    @InjectRepository(FailedRewardJob)
    private readonly failedRewardJobRepository: Repository<FailedRewardJob>,
    @InjectRepository(Reward)
    private readonly rewardRepository: Repository<Reward>,
    @InjectRepository(StreakMilestone)
    private readonly streakMilestoneRepository: Repository<StreakMilestone>,
    private readonly deadLetterProcessor: DeadLetterProcessor,
  ) {}

  async processStreakMilestone(
    userId: string,
    milestoneId: string,
  ): Promise<{ awarded: boolean; rewardId?: string }> {
    const milestone = await this.streakMilestoneRepository.findOne({
      where: { id: milestoneId },
    });

    if (!milestone || !milestone.isActive) {
      this.logger.warn(
        `Streak milestone ${milestoneId} is not configured or inactive; skipping award`,
      );
      return { awarded: false };
    }

    const existingReward = await this.rewardRepository.findOne({
      where: { userId, streakMilestoneId: milestoneId },
    });

    if (existingReward) {
      this.logger.warn(
        `Reward already issued for user ${userId} and milestone ${milestoneId}; skipping duplicate`,
      );
      return { awarded: false, rewardId: existingReward.id };
    }

    const reward = this.rewardRepository.create({
      userId,
      streakMilestoneId: milestoneId,
      xlmAmount: milestone.xlmAmount,
      status: 'pending',
    });

    const savedReward = await this.rewardRepository.save(reward);

    return { awarded: true, rewardId: savedReward.id };
  }

  async listFailedJobs(
    query: ListFailedJobsDto,
  ): Promise<ListFailedJobsResponseDto> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [jobs, total] = await this.failedRewardJobRepository.findAndCount({
      order: { failedAt: 'DESC' },
      skip: skip,
      take: limit,
    });

    return {
      data: jobs.map((job) => ({
        id: job.id,
        userId: job.userId,
        xlmAmount: job.xlmAmount,
        taskCompletionId: job.taskCompletionId,
        errorMessage: job.errorMessage,
        jobId: job.jobId,
        attemptsMade: job.attemptsMade,
        jobType: job.jobType,
        failedAt: job.failedAt,
      })),
      page: page,
      limit: limit,
      total: total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async replayFailedJob(
    failedJobId: string,
  ): Promise<ReplayFailedJobResponseDto> {
    const failedJob = await this.failedRewardJobRepository.findOne({
      where: { id: failedJobId },
    });

    if (!failedJob) {
      throw new NotFoundException(
        `Failed reward job with ID ${failedJobId} not found`,
      );
    }

    try {
      const result = await this.deadLetterProcessor.replayFailedJob(
        failedJobId,
      );

      return {
        success: true,
        message: `Failed job ${failedJobId} has been re-queued successfully.`,
        replayedJobId: result.jobId,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to replay job ${failedJobId}: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to replay job: ${errorMessage}`,
      };
    }
  }

  async retryFailedJob(
    failedJobId: string,
  ): Promise<ReplayFailedJobResponseDto> {
    const failedJob = await this.failedRewardJobRepository.findOne({
      where: { id: failedJobId },
    });

    if (!failedJob) {
      throw new NotFoundException(
        `Failed reward job with ID ${failedJobId} not found`,
      );
    }

    try {
      const result = await this.deadLetterProcessor.replayFailedJob(
        failedJobId,
      );

      return {
        success: true,
        message: `Failed job ${failedJobId} has been re-enqueued successfully.`,
        replayedJobId: result.jobId,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to retry job ${failedJobId}: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to retry job: ${errorMessage}`,
      };
    }
  }
}
