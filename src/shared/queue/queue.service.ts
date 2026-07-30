import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { NOTIFICATION_QUEUE, REWARD_QUEUE } from '../queue/queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private notificationQueue: Queue,
    @InjectQueue(REWARD_QUEUE) private rewardQueue: Queue,
  ) {}

  async addDelayedJob(
    queueName: string,
    jobName: string,
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
    if (!queue) {
      this.logger.error(Queue  not found);
      return;
    }

    try {
      await queue.add(jobName, data, {
        delay: delayMs,
        ...options,
      });
      this.logger.log(Added delayed job  to  with delay ms);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(Failed to add delayed job to : );
    }
  }

  private getQueue(name: string): Queue | null {
    if (name === NOTIFICATION_QUEUE) return this.notificationQueue;
    if (name === REWARD_QUEUE) return this.rewardQueue;
    return null;
  }

  async clearQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    if (!queue) {
      this.logger.error(Queue  not found);
      return;
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
    }
  }
}