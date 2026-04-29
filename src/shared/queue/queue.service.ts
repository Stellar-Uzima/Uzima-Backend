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
} from '../../queue/queue.constants';

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

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

@Injectable()
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
    options?: JobOptions,
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const job = await queue.add(jobName, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
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
   * Add a job with delay
   */
  async addDelayedJob<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    delayMs: number,
    options?: JobOptions,
  ): Promise<Job<T>> {
    return this.addJob(queueName, jobName, data, {
      ...options,
      delay: delayMs,
    });
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

      // Add to dead letter queue with failure information
      await this.deadLetterQueue.add('failed-job', {
        originalQueue: queueName,
        originalJobId: jobId,
        originalJobName: job.name,
        originalData: job.data,
        failedReason: reason || job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        failedAt: Date.now(),
      });

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
      await queue.clean(0, 'waiting');
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
