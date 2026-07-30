import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job, JobOptions } from 'bull';
import {
  QueueName,
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
  maxRetries?: number;
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

  async addJob<T>(
    queueName: QueueName,
    jobName: string,
<<<<<<< HEAD
    data: T,
    options?: QueueJobOptions,
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
=======
    data: any,
    delayMs: number,
 feat/add-endpoints
    options?: any,
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
 main
  ): Promise<void> {
    const queue = this.getQueue(queueName);
>>>>>>> 1e921906e7a2617f231127e7fe2dd4f72067076a
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      const attempts = options?.maxRetries ?? options?.attempts ?? 3;
      const backoffDelay = options?.backoffMs ?? (options?.backoff as any)?.delay ?? 1000;

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
        Job  added to queue  with ID: ,
      );
      return job;
    } catch (error) {
      this.logger.error(
        Failed to add job  to queue :,
        error,
      );
      throw error;
    }
  }

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
    } as any);
  }

  async getJobStatus(queueName: QueueName, jobId: string): Promise<JobStatus | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        return null;
      }

      const state = await job.getState();

      return {
        id: job.id!.toString(),
        name: job.name,
        data: job.data,
        opts: job.opts,
        progress: job.progress(),
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
        Failed to get job status for job  in queue :,
        error,
      );
      throw error;
    }
  }

  async getQueueStats(queueName: QueueName): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
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
        Failed to get stats for queue :,
        error,
      );
      throw error;
    }
  }

  async getAllQueueStats(): Promise<Record<QueueName, QueueStats>> {
    const stats: Partial<Record<QueueName, QueueStats>> = {};

    for (const queueName of this.queues.keys()) {
      try {
        stats[queueName] = await this.getQueueStats(queueName);
      } catch (error) {
        this.logger.error(Failed to get stats for queue :, error);
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

  async retryJob(queueName: QueueName, jobId: string): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new Error(Job  not found in queue );
      }

      await job.retry();
      this.logger.log(Job  retried in queue );
      return job;
    } catch (error) {
      this.logger.error(
        Failed to retry job  in queue :,
        error,
      );
      throw error;
    }
  }

  async cancelJob(queueName: QueueName, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new Error(Job  not found in queue );
      }

      await job.remove();
      this.logger.log(Job  cancelled in queue );
    } catch (error) {
      this.logger.error(
        Failed to cancel job  in queue :,
        error,
      );
      throw error;
    }
  }

  async moveToDeadLetter(
    queueName: QueueName,
    jobId: string,
    reason?: string,
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new Error(Job  not found in queue );
      }

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

      await job.remove();
      
      this.logger.log(
        Job  moved to dead letter queue from ,
      );
    } catch (error) {
      this.logger.error(
        Failed to move job  to dead letter queue:,
        error,
      );
      throw error;
    }
  }

  async clearQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      await queue.clean(0, 'completed' as any);
      await queue.clean(0, 'failed' as any);
      await queue.clean(0, 'waiting' as any);
      await queue.clean(0, 'delayed' as any);
      
      this.logger.log(Queue  cleared);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(Failed to clear queue : );
      throw error;
    }
  }

  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      await queue.pause();
      this.logger.log(Queue  paused);
    } catch (error) {
      this.logger.error(Failed to pause queue :, error);
      throw error;
    }
  }

  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      await queue.resume();
      this.logger.log(Queue  resumed);
    } catch (error) {
      this.logger.error(Failed to resume queue :, error);
      throw error;
    }
  }

  async getJobsByStatus(
    queueName: QueueName,
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start?: number,
    end?: number,
  ): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(Queue  not found);
    }

    try {
      return await queue.getJobs([status], start, end);
    } catch (error) {
      this.logger.error(
        Failed to get  jobs from queue :,
        error,
      );
      throw error;
    }
  }
}