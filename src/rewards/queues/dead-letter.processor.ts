import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  REWARD_DEAD_LETTER_QUEUE,
  REWARD_DEAD_LETTER_JOB,
  REWARD_QUEUE,
  REWARD_DISTRIBUTION_JOB,
} from '../../queue/queue.constants';
import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_JOB_ATTEMPTS,
  FailureCategory,
  classifyFailure,
  emptyFailureCategoryCounts,
} from '../../queue/queue-policy';
import { FailedRewardJob } from '../entities/failed-reward-job.entity';

export interface DeadLetterJobData {
  userId: string;
  xlmAmount: number;
  taskCompletionId?: string;
  errorMessage: string;
  /** Classified root cause, supplied by the reward processor when available. */
  failureCategory?: FailureCategory;
  jobId?: string;
  attemptsMade: number;
  /** Attempt budget the original job exhausted. */
  maxAttempts?: number;
  jobType: string;
  jobData: Record<string, unknown>;
}

/** Grouped view of persisted dead letters, so on-call can see the dominant cause. */
export interface DeadLetterFailureSummary {
  total: number;
  byCategory: Record<FailureCategory, number>;
  topErrors: Array<{ message: string; count: number }>;
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
  @Process({ name: REWARD_DEAD_LETTER_JOB, concurrency: 3 })
  async handleDeadLetter(job: Job<DeadLetterJobData>) {
    this.logger.warn(
      `Processing dead letter job ${job.id} for completion ${job.data.taskCompletionId}`,
    );

    const {
      userId,
      xlmAmount,
      taskCompletionId,
      errorMessage,
      jobId,
      attemptsMade,
      jobType,
      jobData,
    } = job.data;

    // Keep the classified root cause with the record so a failure "family"
    // (timeout vs validation vs contract) is visible in the admin API.
    const failureCategory = job.data.failureCategory ?? classifyFailure(errorMessage);
    const persistedJobData: Record<string, unknown> = {
      ...(jobData ?? {}),
      failureCategory,
    };

    // Save failed job to DB for admin review and replay
    const failedJob = this.failedRewardJobRepository.create({
      userId,
      xlmAmount,
      taskCompletionId,
      errorMessage,
      jobId: jobId || job.id?.toString(),
      attemptsMade,
      jobType,
      jobData: persistedJobData,
    });

    await this.failedRewardJobRepository.save(failedJob);

    this.logger.error(
      `Dead letter recorded for user ${userId}, completion ${taskCompletionId}: ` +
        `[${failureCategory}] ${errorMessage}`,
    );

    return { success: true, failedJobId: failedJob.id };
  }

  /**
   * Summarise the persisted dead letters by root cause.
   *
   * `GET /admin/rewards/failed-jobs` lists the raw rows; this answers the
   * incident question directly: how many failures, which category dominates,
   * and which exact error message keeps repeating.
   *
   * @param limit Number of most recent failed jobs to consider (default 500)
   */
  async getFailureSummary(limit = 500): Promise<DeadLetterFailureSummary> {
    const failedJobs = await this.failedRewardJobRepository.find({
      order: { failedAt: 'DESC' },
      take: limit,
    });

    const byCategory = emptyFailureCategoryCounts();
    const errorCounts = new Map<string, number>();

    for (const failedJob of failedJobs) {
      byCategory[classifyFailure(failedJob.errorMessage)] += 1;
      errorCounts.set(
        failedJob.errorMessage,
        (errorCounts.get(failedJob.errorMessage) ?? 0) + 1,
      );
    }

    const topErrors = Array.from(errorCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
      .slice(0, 5);

    return { total: failedJobs.length, byCategory, topErrors };
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
        attempts: DEFAULT_JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: DEFAULT_BACKOFF_MS,
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
