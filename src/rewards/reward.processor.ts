import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger, Injectable } from '@nestjs/common';
import {
  REWARD_QUEUE,
  REWARD_DISTRIBUTION_JOB,
  REWARD_DEAD_LETTER_QUEUE,
} from '../queue/queue.constants';
import { RewardService } from './reward.service';

interface RewardJobData {
  completionId: string;
  userId: string;
  xlmAmount: number;
}

interface DeadLetterJobData {
  userId: string;
  xlmAmount: number;
  taskCompletionId?: string;
  errorMessage: string;
  jobId?: string;
  attemptsMade: number;
  jobType: string;
  jobData: Record<string, unknown>;
}

@Processor(REWARD_QUEUE)
@Injectable()
export class RewardProcessor {
  private readonly logger = new Logger(RewardProcessor.name);

  constructor(
    private readonly rewardService: RewardService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(REWARD_QUEUE) private readonly rewardQueue: Queue,
    @InjectQueue(REWARD_DEAD_LETTER_QUEUE) private readonly dlq: Queue<DeadLetterJobData>,
  ) {}

  @Process({ name: REWARD_DISTRIBUTION_JOB, concurrency: 5 })
  async handleRewardDistribution(job: Job<RewardJobData>) {
    this.logger.log(
      `Processing job ${job.id} for completion ${job.data.completionId}`,
    );
    const { completionId, userId, xlmAmount } = job.data;
    await this.rewardService.processRewardJob(completionId, userId, xlmAmount);
  }

  @OnQueueFailed()
  async onFailed(job: Job<RewardJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed: ${error.message}. Attempts made: ${job.attemptsMade}`,
    );

    // If we've reached max attempts limit, move to dead letter queue
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      await this.rewardService.handleRewardFailure(job.data.completionId);

      // Add to dead letter queue for persistence and admin review
      await this.dlq.add('process', {
        userId: job.data.userId,
        xlmAmount: job.data.xlmAmount,
        taskCompletionId: job.data.completionId,
        errorMessage: error.message,
        jobId: job.id?.toString(),
        attemptsMade: job.attemptsMade,
        jobType: REWARD_DISTRIBUTION_JOB,
        jobData: job.data as Record<string, unknown>,
      });

      // Emit failure event for notification service
      this.eventEmitter.emit('reward.failed', {
        userId: job.data.userId,
        completionId: job.data.completionId,
        error: error.message,
      });

      this.logger.warn(
        `Job ${job.id} moved to dead letter queue after ${job.attemptsMade} attempts`,
      );
    }
  }
}
