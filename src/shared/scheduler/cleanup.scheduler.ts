import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../modules/users/users.service';

/**
 * Retention and cleanup policy for user status logs.
 *
 * ## Overview
 * The `CleanupScheduler` periodically purges old {@link UserStatusLog} records
 * to prevent unbounded table growth and comply with data retention best practices.
 *
 * ## Retention Period
 * - **Default:** 90 days
 * - **Configurable via:** `STATUS_LOG_RETENTION_DAYS` environment variable
 * - Records older than the configured retention period are **permanently deleted**.
 *
 * ## Schedule
 * - **Frequency:** Daily at midnight (00:00 UTC)
 * - **Cron expression:** `0 0 * * *` (`CronExpression.EVERY_DAY_AT_MIDNIGHT`)
 * - The job runs automatically when the application is running.
 *
 * ## What is cleaned up
 * - {@link UserStatusLog} rows whose `createdAt` timestamp is older than
 *   `NOW() - STATUS_LOG_RETENTION_DAYS` days.
 *
 * ## Data Considerations
 * - **No archival** – deleted records cannot be recovered.
 * - **Cascading** – the `UserStatusLog` entity uses `onDelete: 'CASCADE'`
 *   for the `userId` FK and `onDelete: 'SET NULL'` for `changedBy`.
 *   Deleting logs does not cascade to the parent `User` records.
 *
 * ## Configuration
 * Set in your environment or `.env` file:
 * ```env
 * STATUS_LOG_RETENTION_DAYS=90
 * ```
 *
 * ## Monitoring
 * The job logs the number of deleted records on each successful run and
 * any errors encountered.
 *
 * ## Operational Notes
 * - **Failure handling:** If the job fails (e.g., DB connectivity issue),
 *   it logs the error and retries on the next scheduled run (24h later).
 *   No records are lost — they remain in the table until a successful run.
 * - **Manual run:** To trigger cleanup manually, inject `CleanupScheduler`
 *   and call `handleStatusLogsCleanup()` directly.
 * - **Verification:** After a cleanup run, check the application logs for
 *   the message `Cleanup job completed successfully. Deleted N old records.`
 * - **No downtime required:** The DELETE runs in a single transaction and
 *   does not impact read/write operations on the `UserStatusLog` table.
 */
@Injectable()
export class CleanupScheduler {
  private readonly logger = new Logger(CleanupScheduler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Scheduled job: deletes user status log records older than the configured
   * retention period (default 90 days).
   *
   * Runs daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleStatusLogsCleanup() {
    this.logger.log('Starting user status logs cleanup job...');
    try {
      const retentionDays = this.configService.get<number>(
        'STATUS_LOG_RETENTION_DAYS',
        90,
      );
      
      const deletedCount = await this.usersService.cleanupOldStatusLogs(
        Number(retentionDays),
      );
      
      this.logger.log(
        `Cleanup job completed successfully. Deleted ${deletedCount} old records.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cleanup user status logs: ${message}`);
    }
  }
}
