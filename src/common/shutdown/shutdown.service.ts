import { Injectable, Logger, OnApplicationShutdown, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  REWARD_QUEUE,
  PROOF_VERIFICATION_QUEUE,
  NOTIFICATION_QUEUE,
  TASK_VERIFICATION_QUEUE,
  USER_ACTIVITY_QUEUE,
  DATA_PROCESSING_QUEUE,
} from '../../queue/queue.constants';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional() @InjectQueue(REWARD_QUEUE) private readonly rewardQueue?: Queue,
    @Optional() @InjectQueue(PROOF_VERIFICATION_QUEUE) private readonly proofQueue?: Queue,
    @Optional() @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue?: Queue,
    @Optional() @InjectQueue(TASK_VERIFICATION_QUEUE) private readonly taskVerificationQueue?: Queue,
    @Optional() @InjectQueue(USER_ACTIVITY_QUEUE) private readonly userActivityQueue?: Queue,
    @Optional() @InjectQueue(DATA_PROCESSING_QUEUE) private readonly dataProcessingQueue?: Queue,
  ) {}

  private async safeCloseQueue(q?: Queue, name?: string) {
    if (!q) return;
    try {
      this.logger.log(`Closing queue ${name ?? q.name}`);
      await q.close();
      this.logger.log(`Closed queue ${name ?? q.name}`);
    } catch (err) {
      this.logger.error(`Error closing queue ${name ?? q?.name}: ${(err as Error)?.message}`);
    }
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Application shutdown initiated${signal ? ` by ${signal}` : ''}`);

    // Close HTTP server and stop accepting new requests is handled by Nest's app.close()

    // 1) Close queues
    await Promise.all([
      this.safeCloseQueue(this.rewardQueue, REWARD_QUEUE),
      this.safeCloseQueue(this.proofQueue, PROOF_VERIFICATION_QUEUE),
      this.safeCloseQueue(this.notificationQueue, NOTIFICATION_QUEUE),
      this.safeCloseQueue(this.taskVerificationQueue, TASK_VERIFICATION_QUEUE),
      this.safeCloseQueue(this.userActivityQueue, USER_ACTIVITY_QUEUE),
      this.safeCloseQueue(this.dataProcessingQueue, DATA_PROCESSING_QUEUE),
    ]);

    // 2) Close Redis (flush and quit)
    if (this.redis) {
      try {
        this.logger.log('Flushing and quitting Redis client');
        // quit() waits for pending commands
        await this.redis.quit();
        this.logger.log('Redis client quit successfully');
      } catch (err) {
        this.logger.error(`Error quitting Redis: ${(err as Error)?.message}`);
        try {
          this.redis.disconnect();
          this.logger.log('Redis disconnected');
        } catch (e) {}
      }
    }

    // 3) Close DB connection pool
    if (this.dataSource) {
      try {
        this.logger.log('Closing database connection pool');
        if (this.dataSource.isInitialized) {
          await this.dataSource.destroy();
          this.logger.log('Database connection pool closed');
        } else {
          this.logger.log('DataSource was not initialized');
        }
      } catch (err) {
        this.logger.error(`Error closing DataSource: ${(err as Error)?.message}`);
      }
    }

    this.logger.log('Shutdown steps complete');
  }
}
