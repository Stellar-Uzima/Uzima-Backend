import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { User } from '../../entities/user.entity';
import { HealthReportService } from '../health-report.service';
import { HEALTH_REPORT_QUEUE, GENERATE_HEALTH_REPORT_JOB } from '../../queue/queue.constants';

interface GenerateHealthReportJobData {
  userId: string;
  periodStart: string;
  periodEnd: string;
}

@Injectable()
@Processor(HEALTH_REPORT_QUEUE)
export class ReportGenerationProcessor {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly healthReportService: HealthReportService,
    @InjectQueue(HEALTH_REPORT_QUEUE)
    private readonly healthReportQueue: Queue
  ) {}

  /**
   * Fans out report generation to all active users every Monday at
   * 8:00 AM UTC. Enqueues one job per user rather than generating
   * inline, so a failure for one user doesn't block the rest of the
   * batch and each report benefits from Bull's built-in retry/backoff.
   */
  @Cron('0 0 8 * * 1') // 8:00 AM UTC every Monday
  async enqueueWeeklyReports(): Promise<void> {
    this.logger.log('Starting weekly health report fan-out');

    try {
      const activeUsers = await this.userRepository.find({
        where: { isActive: true },
      });

      this.logger.log(`Found ${activeUsers.length} active users for report generation`);

      const { periodStart, periodEnd } = this.getPreviousWeekPeriod();
      let enqueuedCount = 0;

      for (const user of activeUsers) {
        try {
          await this.healthReportQueue.add(
            GENERATE_HEALTH_REPORT_JOB,
            {
              userId: user.id,
              periodStart: periodStart.toISOString(),
              periodEnd: periodEnd.toISOString(),
            } as GenerateHealthReportJobData,
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
          );
          enqueuedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to enqueue health report job for user ${user.id}: ${(error as Error).message}`
          );
        }
      }

      this.logger.log(`Enqueued ${enqueuedCount} health report generation jobs`);
    } catch (error) {
      this.logger.error(
        `Weekly health report fan-out failed: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }

  /**
   * Processes a single user's report generation job. Idempotent via
   * findOrCreatePendingReport: if a report for this user/period already
   * exists (e.g. from a manual trigger or a retried job), it's reused
   * rather than duplicated.
   */
  @Process(GENERATE_HEALTH_REPORT_JOB)
  async handleGenerateReport(job: Job<GenerateHealthReportJobData>): Promise<void> {
    const { userId, periodStart, periodEnd } = job.data;

    this.logger.log(`Processing health report job for user ${userId}`);

    const report = await this.healthReportService.findOrCreatePendingReport(
      userId,
      new Date(periodStart),
      new Date(periodEnd)
    );

    await this.healthReportService.generateReport(report.id);
  }

  /**
   * Reports cover the week that just ended (Monday-Sunday), not the
   * current in-progress week, since the job runs at the start of a
   * new week.
   */
  private getPreviousWeekPeriod(): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;

    const thisWeekMonday = new Date(now);
    thisWeekMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
    thisWeekMonday.setUTCHours(0, 0, 0, 0);

    const periodEnd = new Date(thisWeekMonday);
    periodEnd.setUTCDate(thisWeekMonday.getUTCDate() - 1);
    periodEnd.setUTCHours(23, 59, 59, 999);

    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodEnd.getUTCDate() - 6);
    periodStart.setUTCHours(0, 0, 0, 0);

    return { periodStart, periodEnd };
  }
}
