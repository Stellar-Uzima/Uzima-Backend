import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class RewardsScheduler {
  private readonly logger = new Logger(RewardsScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Cron job: Reset daily XLM reward counters for all users at midnight UTC.
   * Runs at exactly 00:00 UTC every day.
   * Prevents users from being permanently limited after hitting their daily cap.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // 00:00 UTC
  async resetDailyRewardCounters(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting daily XLM reward counter reset job');

    try {
      // Get all users with non-zero dailyXlmEarned (only reset those who earned)
      const result = await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({ dailyXlmEarned: 0 })
        .where('dailyXlmEarned > 0')
        .execute();

      const duration = Date.now() - startTime;
      const resetCount = result.affected ?? 0;

      this.logger.log(
        'Daily reward counter reset completed. Reset ' + resetCount + ' users in ' + duration + 'ms',
      );
    } catch (error) {
      this.logger.error(
        'Daily reward counter reset job failed: ' + error.message,
        error.stack,
      );
    }
  }

  /**
   * Manual trigger for testing - resets all users' daily reward counters.
   * POST /admin/rewards/reset-daily
   */
  async resetManually(): Promise<{ resetCount: number; durationMs: number }> {
    const startTime = Date.now();
    this.logger.log('Manually triggering daily reward counter reset');

    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ dailyXlmEarned: 0 })
      .where('dailyXlmEarned > 0')
      .execute();

    const durationMs = Date.now() - startTime;
    const resetCount = result.affected ?? 0;

    this.logger.log(
      'Manual reset completed. Reset ' + resetCount + ' users in ' + durationMs + 'ms',
    );

    return { resetCount, durationMs };
  }
}
