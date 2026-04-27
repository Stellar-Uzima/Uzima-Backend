import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AuditService } from '@/audit/audit.service';
import { ReportsService, ReportType } from './reports.service';
import { NotificationService } from '@/notifications/services/notification.service';

interface ScheduledReport {
  name: string;
  reportType: ReportType;
  cronExpression: string;
  recipients: string[];
  createdAt: string;
}

@Injectable()
export class ReportsSchedulerService {
  private readonly logger = new Logger(ReportsSchedulerService.name);
  private readonly schedules = new Map<string, ScheduledReport>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async scheduleReport(
    name: string,
    cronExpression: string,
    reportType: ReportType,
    recipients: string[],
  ) {
    if (this.schedules.has(name)) {
      throw new Error('A scheduled report with this name already exists');
    }

    const job = new CronJob(
      cronExpression,
      async () => await this.executeScheduledReport(name),
      null,
      true,
      'UTC',
    );

    this.schedulerRegistry.addCronJob(name, job);
    this.schedules.set(name, {
      name,
      cronExpression,
      reportType,
      recipients,
      createdAt: new Date().toISOString(),
    });

    await this.auditService.logAction('system', `Scheduled report ${name} (${reportType})`);
    return this.getScheduledReport(name);
  }

  async executeScheduledReport(name: string) {
    const schedule = this.schedules.get(name);
    if (!schedule) {
      this.logger.warn(`Scheduled report not found: ${name}`);
      return;
    }

    const payload = await this.reportsService.getReportByType(schedule.reportType);
    await this.distributeReport(schedule.reportType, schedule.recipients, `Scheduled report: ${schedule.name}`, payload);

    await this.auditService.logAction(
      'system',
      `Executed scheduled report ${name} and distributed to ${schedule.recipients.length} recipient(s)`,
    );
    this.logger.log(`Executed scheduled report ${name}`);
  }

  async distributeReport(reportType: ReportType, recipients: string[], title: string, payload?: any) {
    const reportPayload = payload ?? (await this.reportsService.getReportByType(reportType));
    const summary = JSON.stringify(reportPayload, null, 2);

    for (const recipient of recipients) {
      await this.notificationService.createNotification({
        userId: recipient,
        type: 'report',
        title,
        body: summary,
      });
    }

    await this.auditService.logAction(
      'system',
      `Distributed ${reportType} report to ${recipients.length} recipient(s)`,
    );
    return { message: 'Report distributed successfully', recipients: recipients.length };
  }

  getScheduledReport(name: string) {
    return this.schedules.get(name);
  }

  listSchedules() {
    return Array.from(this.schedules.values());
  }
}
