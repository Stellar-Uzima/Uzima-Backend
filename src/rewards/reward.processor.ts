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
  REWARD_DEAD_LETTER_JOB,
} from '../queue/queue.constants';
import {
  DEFAULT_JOB_ATTEMPTS,
  FailureCategory,
  classifyFailure,
  isRetryExhausted,
} from '../queue/queue-policy';
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
  /** Classified root cause, so dead letters can be grouped by failure kind. */
  failureCategory?: FailureCategory;
  jobId?: string;
  attemptsMade: number;
  maxAttempts?: number;
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
    const maxAttempts = job.opts.attempts ?? DEFAULT_JOB_ATTEMPTS;

    this.logger.error(
      `Job ${job.id} failed: ${error.message}. Attempts made: ${job.attemptsMade}/${maxAttempts}`,
    );

    // If we've reached max attempts limit, move to dead letter queue
    if (isRetryExhausted(job.attemptsMade, maxAttempts)) {
      const failureCategory = classifyFailure(error.message);

      await this.rewardService.handleRewardFailure(job.data.completionId);

      // Add to dead letter queue for persistence and admin review. The
      // category is what lets on-call group a burst of failures by root cause
      // instead of reading every stack trace.
      await this.dlq.add(REWARD_DEAD_LETTER_JOB, {
        userId: job.data.userId,
        xlmAmount: job.data.xlmAmount,
        taskCompletionId: job.data.completionId,
        errorMessage: error.message,
        failureCategory,
        jobId: job.id?.toString(),
        attemptsMade: job.attemptsMade,
        maxAttempts,
        jobType: REWARD_DISTRIBUTION_JOB,
        jobData: job.data as unknown as Record<string, unknown>,
      });

      // Emit failure event for notification service
      this.eventEmitter.emit('reward.failed', {
        userId: job.data.userId,
        completionId: job.data.completionId,
        error: error.message,
      });

      this.logger.warn(
        `Job ${job.id} moved to dead letter queue after ${job.attemptsMade}/${maxAttempts} attempts [${failureCategory}]`,
      );
    }
  }
}
