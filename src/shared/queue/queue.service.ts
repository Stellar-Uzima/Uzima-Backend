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
    options?: any,
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
