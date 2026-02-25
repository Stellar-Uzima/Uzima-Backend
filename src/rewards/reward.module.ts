import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardController } from './reward.controller';
import { RewardService } from './reward.service';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { TaskCompletion } from '../task-completion/entities/task-completion.entity';
import { HealthTask } from '../entities/health-task.entity';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { RewardProcessor } from './reward.processor';
import { REWARD_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardTransaction, TaskCompletion, HealthTask]),
    CacheModule.register({
      ttl: 120, // 2 minutes default TTL
      isGlobal: false,
    }),
    BullModule.registerQueue({
      name: REWARD_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // 1s delay
        },
      },
    }),
  ],
  controllers: [RewardController],
  providers: [RewardService, RewardProcessor],
  exports: [RewardService],
})
export class RewardModule {}
