import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { RewardStatus } from './enums/reward-status.enum';

@Injectable()
export class RewardsScheduler {
  private readonly logger = new Logger(RewardsScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RewardTransaction)
    private readonly rewardTransactionRepository: Repository<RewardTransaction>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyRewards() {
    const trigger = 'daily';
    this.logger.log([] Starting daily reward reset);

    try {
      const batchSize = 100;
      let offset = 0;
      let totalReset = 0;

      while (true) {
        try {
          const userIds = await this.userRepository
            .createQueryBuilder('user')
            .select('user.id')
            .where('user.deletedAt IS NULL')
            .skip(offset)
            .take(batchSize)
            .getMany();

          if (userIds.length === 0) {
            break;
          }

          for (const user of userIds) {
            try {
              await this.resetUserDailyRewards(user.id);
              totalReset++;
            } catch (userError: any) {
              const userErrMsg = userError instanceof Error ? userError.message : String(userError);
              const userErrStack = userError instanceof Error ? userError.stack : undefined;
              this.logger.error(
                [] Failed resetting daily rewards for user : ,
                userErrStack,
              );
            }
          }

          offset += batchSize;
        } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const errStack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            [] Failed resetting batch at offset : ,
            errStack,
          );
        }
      }

      this.logger.log([] Reset daily rewards for  users);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error([] Daily reward reset failed: , errStack);
    }
  }

  private async resetUserDailyRewards(userId: string): Promise<void> {
    // Reset daily XLM earned for the user
    await this.userRepository.update(
      { id: userId },
      { dailyXlmEarned: 0 },
    );
  }
}
