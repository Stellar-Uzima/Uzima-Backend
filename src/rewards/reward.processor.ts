import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import {
  REWARD_QUEUE,
  REWARD_DISTRIBUTION_JOB,
} from '../queue/queue.constants';
import { RewardService } from './reward.service';

interface RewardJobData {
  completionId: string;
  userId: string;
  xlmAmount: number;
}

@Processor(REWARD_QUEUE)
export class RewardProcessor {
  private readonly logger = new Logger(RewardProcessor.name);

  constructor(
    private readonly rewardService: RewardService,
    private readonly eventEmitter: EventEmitter2,
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
      `Job ${job.id} failed: ${error.message}. Attemps made: ${job.attemptsMade}`,
    );

    // If we've reached max attempts limit
    if (job.attemptsMade >= job.opts.attempts) {
      await this.rewardService.handleRewardFailure(job.data.completionId);

      // Emit failure event explicitly after max retries
      this.eventEmitter.emit('reward.failed', {
        userId: job.data.userId,
        completionId: job.data.completionId,
        error: error.message,
      });
    }
  }
}
