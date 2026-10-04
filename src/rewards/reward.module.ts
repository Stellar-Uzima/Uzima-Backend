import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardController } from './reward.controller';
import { RewardService } from './reward.service';
import { RewardCatalogController } from './reward-catalog.controller';
import { RewardCatalogService } from './reward-catalog.service';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { RewardCatalog } from './entities/reward-catalog.entity';
import { FailedRewardJob } from './entities/failed-reward-job.entity';
import { TaskCompletion } from '../tasks/entities/task-completion.entity';
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
import { AntiAbuseModule } from '../modules/anti-abuse/anti-abuse.module';
import { RewardClaimGuard } from '../modules/anti-abuse/reward-claim.guard';
import { WalletModule } from '../../modules/wallet/wallet.module';

@Module({
  imports: [
    StellarModule,
    TypeOrmModule.forFeature([
      RewardTransaction,
      RewardCatalog,
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
    AntiAbuseModule,
  ],
  controllers: [RewardController, RewardCatalogController],
  providers: [
    RewardService,
    RewardCatalogService,
    RewardProcessor,
    RewardClaimGuard,
    DeadLetterProcessor,
    RewardsScheduler,
  ],
  exports: [RewardService, RewardCatalogService, DeadLetterProcessor, RewardsScheduler, TypeOrmModule],
})
export class RewardModule {}