import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../entities/user.entity';

const RESET_BATCH_SIZE = 500;

export interface DailyRewardsResetResult {
  startedAt: string;
  completedAt: string;
  resetCount: number;
  failedCount: number;
  durationMs: number;
}

@Injectable()
export class RewardsScheduler {
  private readonly logger = new Logger(RewardsScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async resetDailyRewards(): Promise<void> {
    await this.runDailyRewardsReset('cron');
  }

  async resetDailyRewardsManually(): Promise<DailyRewardsResetResult> {
    return this.runDailyRewardsReset('manual');
  }

  private async runDailyRewardsReset(
    trigger: 'cron' | 'manual',
  ): Promise<DailyRewardsResetResult> {
    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();
    const totalUsers = await this.userRepository.count();

    this.logger.log(
      [] Starting daily rewards reset at  for  users,
    );

    let resetCount = 0;
    let failedCount = 0;

    for (let offset = 0; offset < totalUsers; offset += RESET_BATCH_SIZE) {
      const users = await this.userRepository.find({
        select: { id: true },
        order: { id: 'ASC' },
        skip: offset,
        take: RESET_BATCH_SIZE,
      });

      const userIds = users.map((user) => user.id);
      if (userIds.length === 0) {
        continue;
      }

      try {
        const result = await this.userRepository.update(
          { id: In(userIds) },
          { dailyXlmEarned: 0 },
        );
        resetCount += result.affected ?? userIds.length;
      } catch (error: any) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          [] Failed resetting batch at offset : ,
          errStack,
        );

        for (const userId of userIds) {
          try {
            const result = await this.userRepository.update(
              { id: userId },
              { dailyXlmEarned: 0 },
            );
            resetCount += result.affected ?? 1;
          } catch (userError: any) {
            failedCount += 1;
            const userErrMsg = userError instanceof Error ? userError.message : String(userError);
            const userErrStack = userError instanceof Error ? userError.stack : undefined;
            this.logger.error(
              [] Failed resetting daily rewards for user : ,
              userErrStack,
            );
          }
        }
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const result: DailyRewardsResetResult = {
      startedAt: startedAtIso,
      completedAt: completedAt.toISOString(),
      resetCount,
      failedCount,
      durationMs,
    };

    this.logger.log(
      [] Daily rewards reset completed. Reset  users, failed , duration ms,
    );

    return result;
  }
}
