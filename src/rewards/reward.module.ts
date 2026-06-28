import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardController } from './reward.controller';
import { RewardService } from './reward.service';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { FailedRewardJob } from './entities/failed-reward-job.entity';
import { TaskCompletion } from '../task-completion/entities/task-completion.entity';
import { HealthTask } from '../entities/health-task.entity';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bull';
import { RewardProcessor } from './reward.processor';
import { User } from '../entities/user.entity';
import { RewardsScheduler } from './rewards.scheduler';
import { DeadLetterProcessor } from './queues/dead-letter.processor';
import { REWARD_QUEUE, REWARD_DEAD_LETTER_QUEUE } from '../queue/queue.constants';
import { StellarModule } from '../stellar/stellar.module';
import { BadgeModule } from './badges/badge.module';

@Module({
  imports: [
    StellarModule,
    TypeOrmModule.forFeature([
      RewardTransaction,
      FailedRewardJob,
      TaskCompletion,
      HealthTask,
      User,
    ]),
    CacheModule.register({
      ttl: 120,
      isGlobal: false,
    }),
    BullModule.registerQueue({
      name: REWARD_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    BullModule.registerQueue({
      name: REWARD_DEAD_LETTER_QUEUE,
    }),
    BadgeModule,
  ],
  controllers: [RewardController],
  providers: [RewardService, RewardProcessor, DeadLetterProcessor, RewardsScheduler],
  exports: [RewardService, DeadLetterProcessor, RewardsScheduler, TypeOrmModule],
})
export class RewardModule {}
