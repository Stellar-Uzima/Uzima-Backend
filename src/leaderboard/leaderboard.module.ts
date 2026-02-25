import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';
import { Queue } from 'bull';

import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardProcessor } from './leaderboard.processor';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardTransaction, User]),
    BullModule.registerQueue({
      name: 'leaderboard-tasks',
    }),
    CacheModule.register({
      ttl: 3600,
    }),
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardProcessor],
  exports: [LeaderboardService],
})
export class LeaderboardModule implements OnModuleInit {
  constructor(
    @InjectQueue('leaderboard-tasks') private readonly leaderboardQueue: Queue,
  ) {}

  async onModuleInit() {
    // Add the repeatable daily job at midnight
    // '0 0 * * *' is the cron syntax for 12:00 AM
    await this.leaderboardQueue.add(
      'rebuild-leaderboard',
      {},
      {
        repeat: { cron: '0 0 * * *' },
        jobId: 'daily-leaderboard-rebuild',
        removeOnComplete: true,
      },
    );
  }
}
