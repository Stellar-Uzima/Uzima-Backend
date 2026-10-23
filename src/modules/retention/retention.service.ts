import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthEventLog } from '../../database/entities/auth-event.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { RetentionJobRun } from './entities/retention-job-run.entity';
import { RetentionLegalHold } from './entities/retention-legal-hold.entity';
import { RETENTION_POLICIES } from './retention.policies';

export interface RetentionResult {
  statusLogs: number;
  authEventLogs: number;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(UserStatusLog)
    private readonly statusLogs: Repository<UserStatusLog>,
    @InjectRepository(AuthEventLog)
    private readonly authEventLogs: Repository<AuthEventLog>,
    @InjectRepository(RetentionLegalHold)
    private readonly legalHolds: Repository<RetentionLegalHold>,
    @InjectRepository(RetentionJobRun)
    private readonly jobRuns: Repository<RetentionJobRun>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource
  ) {}

  private getRetentionDays(envName: string, defaultDays: number): number {
    const days = Number(this.config.get(envName, defaultDays));

    if (!Number.isFinite(days) || days <= 0) {
      throw new Error(`Invalid retention period for ${envName}: ${days}`);
    }

    return days;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredRecords(): Promise<RetentionResult> {
    return this.purge();
  }

  async purge(): Promise<RetentionResult> {
    const run = await this.jobRuns.save(
      this.jobRuns.create({
        jobName: 'data-retention',
        status: 'running',
        completedAt: null,
        deletedCounts: {},
        errorMessage: null,
      })
    );

    try {
      const statusPolicy = RETENTION_POLICIES.find(
        (policy) => policy.dataClass === 'user_status_logs'
      )!;
      const authPolicy = RETENTION_POLICIES.find(
        (policy) => policy.dataClass === 'auth_event_logs'
      )!;

      const statusDays = this.getRetentionDays(
        statusPolicy.ageThresholdDaysEnv,
        statusPolicy.defaultAgeThresholdDays
      );
      const authDays = this.getRetentionDays(
        authPolicy.ageThresholdDaysEnv,
        authPolicy.defaultAgeThresholdDays
      );

      const now = new Date();
      const statusCutoff = new Date(now.getTime() - statusDays * 86400000);
      const authCutoff = new Date(now.getTime() - authDays * 86400000);

      // Delete only expired status logs that have no active legal hold.
      const statusRows: Array<{ id: string }> = await this.dataSource.query(
        `
          DELETE FROM "user_status_logs" AS target
          WHERE target."createdAt" < $1
            AND NOT EXISTS (
              SELECT 1
              FROM "retention_legal_holds" AS hold
              WHERE hold."data_class" = $2
                AND hold."record_id" = target."id"::text
                AND hold."released_at" IS NULL
            )
          RETURNING target."id"
        `,
        [statusCutoff, statusPolicy.dataClass]
      );

      // Respect explicit expiry dates. Legacy auth events without an expiry
      // use the configured age threshold. Active legal holds always win.
      const authRows: Array<{ id: string }> = await this.dataSource.query(
        `
          DELETE FROM "auth_event_logs" AS target
          WHERE (
            (target."retention_expires_at" IS NOT NULL
              AND target."retention_expires_at" <= $1)
            OR
            (target."retention_expires_at" IS NULL
              AND target."created_at" < $2)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "retention_legal_holds" AS hold
            WHERE hold."data_class" = $3
              AND hold."record_id" = target."id"::text
              AND hold."released_at" IS NULL
          )
          RETURNING target."id"
        `,
        [now, authCutoff, authPolicy.dataClass]
      );

      const result = {
        statusLogs: statusRows.length,
        authEventLogs: authRows.length,
      };

      run.status = 'succeeded';
      run.completedAt = new Date();
      run.deletedCounts = result;
      await this.jobRuns.save(run);

      this.logger.log(`Retention run ${run.id} completed: ${JSON.stringify(result)}`);

      return result;
    } catch (error: unknown) {
      run.status = 'failed';
      run.completedAt = new Date();
      run.errorMessage = error instanceof Error ? error.message : String(error);

      await this.jobRuns.save(run);
      this.logger.error(`Retention run ${run.id} failed: ${run.errorMessage}`);

      throw error;
    }
  }
}
