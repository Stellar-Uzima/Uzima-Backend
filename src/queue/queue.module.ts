import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisConfig } from '../config/redis.config';
import {
  REWARD_QUEUE,
  NOTIFICATION_QUEUE,
  TASK_VERIFICATION_QUEUE,
  USER_ACTIVITY_QUEUE,
  DATA_PROCESSING_QUEUE,
} from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisConfigObj = redisConfig(configService);
        
        return {
          redis: {
            host: redisConfigObj.host,
            port: redisConfigObj.port,
            password: redisConfigObj.password,
            db: redisConfigObj.db,
            tls: redisConfigObj.tls ? {} : undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          },
          prefix: 'uzima',
        };
      },
      inject: [ConfigService],
    }),
    // Register individual queues
    BullModule.registerQueue({
      name: REWARD_QUEUE,
      limiter: {
        max: 100,
        duration: 1000,
      },
    }),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
      limiter: {
        max: 50,
        duration: 1000,
      },
    }),
    BullModule.registerQueue({
      name: TASK_VERIFICATION_QUEUE,
      limiter: {
        max: 30,
        duration: 1000,
      },
    }),
    BullModule.registerQueue({
      name: USER_ACTIVITY_QUEUE,
      limiter: {
        max: 200,
        duration: 1000,
      },
    }),
    BullModule.registerQueue({
      name: DATA_PROCESSING_QUEUE,
      limiter: {
        max: 25,
        duration: 1000,
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}