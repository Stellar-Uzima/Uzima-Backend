import { Process, Processor, OnQueueCompleted } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { REWARD_DEAD_LETTER_QUEUE, REWARD_QUEUE, REWARD_DISTRIBUTION_JOB } from '../../queue/queue.constants';
import { FailedRewardJob } from '../entities/failed-reward-job.entity';

export interface DeadLetterJobData {
  userId: string;
  xlmAmount: number;
  taskCompletionId?: string;
  errorMessage: string;
  jobId?: string;
  attemptsMade: number;
  jobType: string;
  jobData: Record<string, unknown>;
}

/**
 * Dead Letter Queue Processor for failed reward jobs.
 * Captures exhausted reward jobs so they can be investigated and replayed by admins.
 */
@Processor(REWARD_DEAD_LETTER_QUEUE)
@Injectable()
export class DeadLetterProcessor {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  constructor(
    @InjectRepository(FailedRewardJob)
    private readonly failedRewardJobRepository: Repository<FailedRewardJob>,
    @InjectQueue(REWARD_QUEUE) private readonly rewardQueue: Queue,
  ) {}

  /**
   * Process a dead letter job - save to DB and log for admin review.
   * Jobs arrive here when they exhaust all retry attempts in the reward queue.
   */
  @Process({ name: 'process', concurrency: 3 })
  async handleDeadLetter(job: Job<DeadLetterJobData>) {
    this.logger.warn(
      `Processing dead letter job ${job.id} for completion ${job.data.taskCompletionId}`,
    );

    const { userId, xlmAmount, taskCompletionId, errorMessage, jobId, attemptsMade, jobType, jobData } = job.data;

    // Save failed job to DB for admin review and replay
    const failedJob = this.failedRewardJobRepository.create({
      userId,
      xlmAmount,
      taskCompletionId,
      errorMessage,
      jobId: jobId || job.id?.toString(),
      attemptsMade,
      jobType,
      jobData,
    });

    await this.failedRewardJobRepository.save(failedJob);

    this.logger.error(
      `Dead letter recorded for user ${userId}, completion ${taskCompletionId}: ${errorMessage}`,
    );

    return { success: true, failedJobId: failedJob.id };
  }

  /**
   * Replay a specific failed job by re-adding it to the reward queue.
   * After replay, the failed job record is removed.
   */
  async replayFailedJob(failedJobId: string): Promise<{ jobId: string }> {
    const failedJob = await this.failedRewardJobRepository.findOne({
      where: { id: failedJobId },
    });

    if (!failedJob) {
      throw new Error(`Failed reward job ${failedJobId} not found`);
    }

    // Re-add to the reward queue
    const replayJob = await this.rewardQueue.add(
      REWARD_DISTRIBUTION_JOB,
      {
        completionId: failedJob.taskCompletionId,
        userId: failedJob.userId,
        xlmAmount: failedJob.xlmAmount,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    // Delete from failed jobs after successful replay initiation
    await this.failedRewardJobRepository.delete(failedJobId);

    this.logger.log(
      `Replayed failed job ${failedJobId} as ${replayJob.id}`,
    );

    return { jobId: replayJob.id?.toString() || '' };
  }
}
