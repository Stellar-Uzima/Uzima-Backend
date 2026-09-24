import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataQualityService } from './data-quality.service';

/**
 * Schedules the data-quality validation jobs. Runs once a day at 03:00 so
 * reports are ready for the morning support shift, with the option to trigger
 * an on-demand pass through the injected service (e.g. from a maintenance
 * task or a test).
 */
@Injectable()
export class DataQualityScheduler {
  private readonly logger = new Logger(DataQualityScheduler.name);

  constructor(private readonly dataQualityService: DataQualityService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyValidations(): Promise<void> {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
    this.logger.log(
      `Starting daily data-quality run for window ${windowStart.toISOString()} → ${windowEnd.toISOString()}`,
    );
    const outcomes = await this.dataQualityService.runAll(windowStart, windowEnd);
    const totalAnomalies = outcomes.reduce(
      (sum, outcome) => sum + outcome.anomalies.length,
      0,
    );
    this.logger.log(
      `Daily data-quality run finished: ${outcomes.length} job(s), ${totalAnomalies} anomaly(ies)`,
    );
  }
}