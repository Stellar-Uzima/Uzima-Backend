import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDigestService } from './notification-digest.service';

/**
 * Schedules the daily notification digest. Runs at 06:00 local server time
 * so the digest lands early in the day, before most users check the app.
 */
@Injectable()
export class NotificationDigestScheduler {
  private readonly logger = new Logger(NotificationDigestScheduler.name);

  constructor(private readonly digestService: NotificationDigestService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDailyDigest(): Promise<void> {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
    this.logger.log(
      `Triggering daily notification digest for ${windowStart.toISOString()} → ${windowEnd.toISOString()}`,
    );
    await this.digestService.runDigest(windowStart, windowEnd);
  }
}