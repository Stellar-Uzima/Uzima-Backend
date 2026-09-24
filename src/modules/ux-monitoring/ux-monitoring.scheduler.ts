import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UxHealthMonitorService } from './ux-health-monitor.service';

/**
 * Periodically evaluates the observed request windows so UX degradation is
 * detected (and auto-resolved) even when the health endpoint is not being
 * polled. Also emits a weekly hygiene summary at a lower cadence.
 */
@Injectable()
export class UxMonitoringScheduler {
  private readonly logger = new Logger(UxMonitoringScheduler.name);

  constructor(private readonly uxHealthMonitor: UxHealthMonitorService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateWindows(): Promise<void> {
    await this.uxHealthMonitor.evaluate();
  }

  @Cron(CronExpression.EVERY_WEEK)
  async weeklySummary(): Promise<void> {
    const summary = await this.uxHealthMonitor.getHealthSummary();
    this.logger.log(
      `Weekly UX health summary: status=${summary.overallStatus} active=${summary.activeDegradations} tracked=${summary.trackedRoutes}`,
    );
  }
}