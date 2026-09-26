import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job, JobOptions } from 'bull';
import {
  QueueName,
  QueueConfig,
  REWARD_QUEUE,
  NOTIFICATION_QUEUE,
  TASK_VERIFICATION_QUEUE,
  PROOF_VERIFICATION_QUEUE,
  USER_ACTIVITY_QUEUE,
  DATA_PROCESSING_QUEUE,
  REWARD_DEAD_LETTER_QUEUE,
  BULK_TASK_ASSIGNMENT_JOB,
  BulkTaskAssignmentJobData,
} from '../../queue/queue.constants';
import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_JOB_ATTEMPTS,
  FailureCategory,
  buildDeadLetterRecord,
  classifyFailure,
  emptyFailureCategoryCounts,
  isRetryExhausted,
} from '../../queue/queue-policy';

export interface QueueJobPayload<T = Record<string, unknown>> {
  name: string;
  data: T;
  attempts?: number;
}

export interface JobStatus {
  id: string;
  name: string;
  data: any;
  opts: JobOptions;
  progress: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: any;
  attemptsMade: number;
  timestamp: number;
}

export interface QueueJobOptions extends JobOptions {
  /** Maximum retry attempts for the job (overrides attempts) */
  maxRetries?: number;
  /** Base backoff delay in milliseconds for exponential backoff */
  backoffMs?: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface ReapResult {
  /** Number of failed jobs inspected. */
  inspected: number;
  /** Ids of the jobs moved into the dead-letter queue. */
  moved: string[];
}

/** One exhausted (or still retrying) job, flattened for operational review. */
export interface FailedJobRecord {
  id: string;
  name: string;
  failedReason: string;
  failureCategory: FailureCategory;
  attemptsMade: number;
  maxAttempts: number;
  exhausted: boolean;
  failedAt?: number;
  stacktrace: string[];
}

/**
 * Root-cause view of a queue's failures: how many jobs failed, how many have
 * exhausted their attempts, and how those failures group by cause. This is the
 * answer to "why is this queue failing?" without a `redis-cli` session.
 */
export interface FailureReport {
  queue: QueueName;
  total: number;
  exhausted: number;
  retrying: number;
  byCategory: Record<FailureCategory, number>;
  records: FailedJobRecord[];
}

@Injectable()
/**
 * Central façade over Bull queues. Provides helpers to enqueue jobs,
 * inspect job/queue status, retry or cancel work, and manage
 * dead-letter and paused-queue operations across the application.
 */
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues: Map<QueueName, Queue>;

  constructor(
    @InjectQueue(REWARD_QUEUE) private rewardQueue: Queue,
    @InjectQueue(NOTIFICATION_QUEUE) private notificationQueue: Queue,
    @InjectQueue(TASK_VERIFICATION_QUEUE) private taskVerificationQueue: Queue,
    @InjectQueue(PROOF_VERIFICATION_QUEUE) private proofVerificationQueue: Queue,
    @InjectQueue(USER_ACTIVITY_QUEUE) private userActivityQueue: Queue,
    @InjectQueue(DATA_PROCESSING_QUEUE) private dataProcessingQueue: Queue,
    @InjectQueue(REWARD_DEAD_LETTER_QUEUE) private deadLetterQueue: Queue,
  ) {
    this.queues = new Map<QueueName, Queue>([
      [REWARD_QUEUE, this.rewardQueue],
      [NOTIFICATION_QUEUE, this.notificationQueue],
      [TASK_VERIFICATION_QUEUE, this.taskVerificationQueue],
      [PROOF_VERIFICATION_QUEUE, this.proofVerificationQueue],
      [USER_ACTIVITY_QUEUE, this.userActivityQueue],
      [DATA_PROCESSING_QUEUE, this.dataProcessingQueue],
      [REWARD_DEAD_LETTER_QUEUE, this.deadLetterQueue],
    ]);
  }

  /**
   * Add a job to a specific queue
   */
  async addJob<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: QueueJobOptions,
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      // Map our friendly options to bull JobOptions
      const attempts = options?.maxRetries ?? options?.attempts ?? DEFAULT_JOB_ATTEMPTS;
      const backoffDelay =
        options?.backoffMs ?? (options?.backoff as any)?.delay ?? DEFAULT_BACKOFF_MS;

      const job = await queue.add(jobName, data, {
        attempts,
        backoff: {
          type: 'exponential',
          delay: backoffDelay,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
        ...options,
      });

      this.logger.log(
        `Job ${jobName} added to queue ${queueName} with ID: ${job.id}`,
      );
      return job;
    } catch (error) {
      this.logger.error(
        `Failed to add job ${jobName} to queue ${queueName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Enqueue bulk task assignment for asynchronous processing.
   */
  async enqueueBulkTaskAssignment(
    data: BulkTaskAssignmentJobData,
    options?: QueueJobOptions,
  ): Promise<Job<BulkTaskAssignmentJobData>> {
    return this.addJob(
      DATA_PROCESSING_QUEUE,
      BULK_TASK_ASSIGNMENT_JOB,
      data,
      options,
    );
  }

  /**
   * Add a job with delay
   */
  async addDelayedJob<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: JobOptions,
  ): Promise<Job<T>> {
    return this.addJob(queueName, jobName, data, options);
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(queueName: QueueName, jobId: string): Promise<JobStatus | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();
      const progress = job.progress();

      return {
        id: job.id!.toString(),
        name: job.name,
        data: job.data,
        opts: job.opts,
        progress,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        returnvalue: job.returnvalue,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get job status for job ${jobId} in queue ${queueName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: QueueName): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
        queue.getPaused(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get stats for queue ${queueName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Ping all queues to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      // Try to get stats from the first queue to verify connection
      const firstQueue = this.queues.values().next().value;
      if (firstQueue) {
        await firstQueue.getWaiting();
      }
      return true;
    } catch (error) {
      this.logger.error('Queue ping failed:', error);
      throw error;
    }
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<Record<QueueName, QueueStats>> {
    const stats: Partial<Record<QueueName, QueueStats>> = {};

    for (const queueName of this.queues.keys()) {
      try {
        stats[queueName] = await this.getQueueStats(queueName);
      } catch (error) {
        this.logger.error(`Failed to get stats for queue ${queueName}:`, error);
        stats[queueName] = {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
        };
      }
    }

    return stats as Record<QueueName, QueueStats>;
  }

  /**
   * Retry a failed job
   */
  async retryJob(queueName: QueueName, jobId: string): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found in queue ${queueName}`);
      }

      await job.retry();
      this.logger.log(`Job ${jobId} retried in queue ${queueName}`);
      return job;
    } catch (error) {
      this.logger.error(
        `Failed to retry job ${jobId} in queue ${queueName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(queueName: QueueName, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found in queue ${queueName}`);
      }

      await job.remove();
      this.logger.log(`Job ${jobId} cancelled in queue ${queueName}`);
    } catch (error) {
      this.logger.error(
        `Failed to cancel job ${jobId} in queue ${queueName}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Move failed job to dead letter queue
   */
  async moveToDeadLetter(
    queueName: QueueName,
    jobId: string,
    reason?: string,
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found in queue ${queueName}`);
      }

      // Add to dead letter queue with failure information (root cause included)
      const record = buildDeadLetterRecord({
        queueName,
        jobId,
        jobName: job.name,
        jobData: job.data,
        reason: reason || job.failedReason,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts?.attempts ?? DEFAULT_JOB_ATTEMPTS,
        stacktrace: job.stacktrace,
        timestamp: job.timestamp,
      });
      await this.deadLetterQueue.add('failed-job', record);

      // Remove from original queue
      await job.remove();
      
      this.logger.log(
        `Job ${jobId} moved to dead letter queue from ${queueName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to move job ${jobId} to dead letter queue:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Move every job in `queueName` that has exhausted its retries into the
   * dead-letter queue.
   *
   * Bull leaves an exhausted job in the queue's `failed` set indefinitely; it
   * does not relocate it on its own. Without this sweep the reward queue was
   * the only queue with a dead-letter path (its processor adds directly), which
   * meant exhausted jobs elsewhere silently piled up with no record of why they
   * failed. Reaping makes the failure reason, category and attempt count
   * inspectable for every queue.
   *
   * @param queueName Queue to sweep
   * @param options.limit Maximum number of failed jobs to inspect (default 1000)
   */
  async reapExhaustedJobs(
    queueName: QueueName,
    options: { limit?: number } = {},
  ): Promise<ReapResult> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const limit = options.limit ?? 1000;
    try {
      const failed = await queue.getFailed(0, limit);
      const moved: string[] = [];

      for (const job of failed) {
        const maxAttempts = job.opts?.attempts ?? DEFAULT_JOB_ATTEMPTS;
        if (!isRetryExhausted(job.attemptsMade, maxAttempts)) {
          continue;
        }

        const jobId = job.id?.toString();
        if (!jobId) {
          continue;
        }

        await this.moveToDeadLetter(queueName, jobId, job.failedReason);
        moved.push(jobId);
      }

      if (moved.length > 0) {
        this.logger.log(
          `Reaped ${moved.length} exhausted job(s) from ${queueName} into the dead letter queue`,
        );
      }

      return { inspected: failed.length, moved };
    } catch (error) {
      this.logger.error(`Failed to reap exhausted jobs from ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Report why a queue is failing, grouped by root cause.
   *
   * Bull keeps failed jobs in the queue (`removeOnFail: false` /
   * `removeOnFail: 50` depending on the call site), so the evidence an operator
   * needs is already there — it just is not readable. This flattens it into
   * per-job records with a classified `failureCategory`, separates jobs that
   * have exhausted their attempts from those still retrying, and counts each
   * category so a burst of identical failures is one line in a report.
   *
   * @param queueName Queue to report on
   * @param options.limit Maximum number of failed jobs to read (default 500)
   */
  async getFailureReport(
    queueName: QueueName,
    options: { limit?: number } = {},
  ): Promise<FailureReport> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const limit = options.limit ?? 500;
    try {
      const failed = await queue.getFailed(0, limit);
      const byCategory = emptyFailureCategoryCounts();
      const records: FailedJobRecord[] = failed.map((job) => {
        const failedReason =
          job.failedReason && job.failedReason.trim().length > 0
            ? job.failedReason
            : 'Unknown failure';
        const maxAttempts = job.opts?.attempts ?? DEFAULT_JOB_ATTEMPTS;
        const failureCategory = classifyFailure(failedReason);
        byCategory[failureCategory] += 1;

        return {
          id: job.id?.toString() ?? 'unknown',
          name: job.name,
          failedReason,
          failureCategory,
          attemptsMade: job.attemptsMade,
          maxAttempts,
          exhausted: isRetryExhausted(job.attemptsMade, maxAttempts),
          failedAt: job.finishedOn,
          stacktrace: job.stacktrace ?? [],
        };
      });

      return {
        queue: queueName,
        total: records.length,
        exhausted: records.filter((record) => record.exhausted).length,
        retrying: records.filter((record) => !record.exhausted).length,
        byCategory,
        records,
      };
    } catch (error) {
      this.logger.error(`Failed to build failure report for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Clear all jobs from a queue
   */
  async clearQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      await queue.clean(0, 'completed');
      await queue.clean(0, 'failed');
      await queue.clean(0, 'wait');
      await queue.clean(0, 'delayed');
      
      this.logger.log(`Queue ${queueName} cleared`);
    } catch (error) {
      this.logger.error(`Failed to clear queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      await queue.pause();
      this.logger.log(`Queue ${queueName} paused`);
    } catch (error) {
      this.logger.error(`Failed to pause queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      await queue.resume();
      this.logger.log(`Queue ${queueName} resumed`);
    } catch (error) {
      this.logger.error(`Failed to resume queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(
    queueName: QueueName,
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start?: number,
    end?: number,
  ): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      return await queue.getJobs([status], start, end);
    } catch (error) {
      this.logger.error(
        `Failed to get ${status} jobs from queue ${queueName}:`,
        error,
      );
      throw error;
    }
  }
}