import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  DataQualityReport,
  DataQualitySeverity,
  DataQualityStatus,
} from './entities/data-quality-report.entity';

/**
 * An actionable anomaly/check result produced by a validation job.
 */
export interface DataQualityCheckOutcome {
  /** Stable identifier of the job, e.g. `users.duplicate_emails`. */
  jobName: string;
  tableName: string;
  severity: DataQualitySeverity;
  /** Total rows/records inspected by the check. */
  checkedCount: number;
  /** Rows that failed the rule. */
  anomalies: Array<Record<string, unknown>>;
  /** Human-readable summary e.g. for report bodies and log lines. */
  summary: string;
}

/**
 * Runs data-quality validation jobs against the core tables and persists a
 * report per job so anomalies can be surfaced with actionable details and
 * tracked over time.
 *
 * Every job is a read-only aggregate over a single core table. When a job
 * finds anomalies at `HIGH`/`CRITICAL` severity the service also emits an
 * operational `logger.error` line, so existing log-based alerting can pick
 * it up without new infrastructure.
 *
 * Jobs:
 *  - `users.duplicate_emails`       — the same email recorded for more than one user.
 *  - `users.unverified_stale`       — accounts that never verified but are long active.
 *  - `referrals.duplicate_claims`   — the same referral relationship rewarded twice.
 *  - `notifications.stale_unread`   — in-app inbox records left unread indefinitely.
 *  - `deliveries.stuck_pending`     — delivery logs stuck retryable for too long.
 *  - `rewards.stale_pending`        — reward transactions stuck PENDING/FAILED.
 *  - `rewards.invalid_amount`       — reward transactions with non-positive amounts.
 */
@Injectable()
export class DataQualityService {
  private readonly logger = new Logger(DataQualityService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(DataQualityReport)
    private readonly reportRepo: Repository<DataQualityReport>,
  ) {}

  /**
   * Runs every configured validation job for the given window and persists
   * one report per job. Returns the check outcomes for callers that want the
   * in-memory result (tests, on-demand runners).
   */
  async runAll(windowStart: Date, windowEnd: Date): Promise<DataQualityCheckOutcome[]> {
    const outcomes = await Promise.all([
      this.checkDuplicateEmails(),
      this.checkUnverifiedStaleAccounts(windowEnd),
      this.checkDuplicateReferralClaims(),
      this.checkStaleUnreadNotifications(windowEnd),
      this.checkStuckDeliveries(windowEnd),
      this.checkStaleRewardTransactions(windowEnd),
      this.checkInvalidRewardAmounts(),
    ]);

    let highCount = 0;
    for (const outcome of outcomes) {
      await this.persistReport(outcome, windowStart, windowEnd);
      if (
        (outcome.severity === DataQualitySeverity.HIGH ||
          outcome.severity === DataQualitySeverity.CRITICAL) &&
        outcome.anomalies.length > 0
      ) {
        highCount += outcome.anomalies.length;
        this.logger.error(
          `DATA_QUALITY_ALERT job=${outcome.jobName} severity=${outcome.severity} anomalies=${outcome.anomalies.length} :: ${outcome.summary}`,
        );
      } else if (outcome.anomalies.length > 0) {
        this.logger.warn(
          `data-quality ${outcome.jobName}: ${outcome.anomalies.length} anomaly(ies)`,
        );
      } else {
        this.logger.log(`data-quality ${outcome.jobName}: passed (${outcome.checkedCount} checked)`);
      }
    }

    if (highCount > 0) {
      this.logger.error(
        `Operational alert: ${highCount} high/critical data-quality anomaly(ies) found in this window`,
      );
    }
    return outcomes;
  }

  /**
   * Retrieves the most recent report for a job (or the latest across jobs),
   * useful for support workflows.
   */
  async getLatestReport(jobName?: string): Promise<DataQualityReport | null> {
    const qb = this.reportRepo.createQueryBuilder('dqr').orderBy('dqr.windowEnd', 'DESC');
    if (jobName) {
      qb.where('dqr.jobName = :jobName', { jobName });
    }
    return qb.getOne();
  }

  private async persistReport(
    outcome: DataQualityCheckOutcome,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<void> {
    const report = this.reportRepo.create({
      jobName: outcome.jobName,
      tableName: outcome.tableName,
      severity: outcome.severity,
      status:
        outcome.anomalies.length > 0
          ? DataQualityStatus.WITH_ANOMALIES
          : DataQualityStatus.PASSED,
      checkedCount: outcome.checkedCount,
      anomalyCount: outcome.anomalies.length,
      summary: outcome.summary,
      anomalies: outcome.anomalies.length > 0 ? outcome.anomalies : null,
      windowStart,
      windowEnd,
    });
    await this.reportRepo.save(report);
  }

  private async checkDuplicateEmails(): Promise<DataQualityCheckOutcome> {
    const rows = await this.dataSource.query(
      `SELECT LOWER(email)::text AS email, COUNT(*)::int AS total,
              ARRAY_AGG(id::text) AS ids
         FROM users
        WHERE email IS NOT NULL AND "deletedAt" IS NULL
        GROUP BY LOWER(email)::text
       HAVING COUNT(*) > 1
        LIMIT 50`,
    );
    return {
      jobName: 'users.duplicate_emails',
      tableName: 'users',
      severity: DataQualitySeverity.CRITICAL,
      checkedCount: await this.countAll('users', 'email'),
      anomalies: rows.map((r: { email: string; total: number; ids: string[] }) => ({
        email: r.email,
        usedByCount: r.total,
        userIds: r.ids,
        action: 'De-duplicate email ownership; issue verification to the active account',
      })),
      summary:
        rows.length > 0
          ? `${rows.length} email address(es) mapped to more than one user`
          : 'No duplicate user emails',
    };
  }

  private async checkUnverifiedStaleAccounts(
    until: Date,
  ): Promise<DataQualityCheckOutcome> {
    const cutoff = new Date(until.getTime() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.dataSource.query(
      `SELECT id, email, "createdAt"
         FROM users
        WHERE "isVerified" = false AND "createdAt" < $1 AND "deletedAt" IS NULL
        LIMIT 50`,
      [cutoff],
    );
    return {
      jobName: 'users.unverified_stale',
      tableName: 'users',
      severity: DataQualitySeverity.MEDIUM,
      checkedCount: await this.countAll('users', 'id'),
      anomalies: rows.map((r: { id: string; email: string | null; createdAt: Date }) => ({
        userId: r.id,
        email: r.email,
        createdAt: r.createdAt,
        action: 'Send a final verification reminder or clean up the account',
      })),
      summary:
        rows.length > 0
          ? `${rows.length} account(s) unverified for more than 90 days`
          : 'No stale unverified accounts',
    };
  }

  private async checkDuplicateReferralClaims(): Promise<DataQualityCheckOutcome> {
    const rows = await this.dataSource.query(
      `SELECT "referrer_id"::text AS referrerId, "referred_id"::text AS referredId,
              COUNT(*)::int AS total
         FROM referral_records
        WHERE "rewardPaid" = true
        GROUP BY "referrer_id", "referred_id"
       HAVING COUNT(*) > 1
        LIMIT 50`,
    );
    return {
      jobName: 'referrals.duplicate_claims',
      tableName: 'referral_records',
      severity: DataQualitySeverity.HIGH,
      checkedCount: await this.countAll('referral_records', 'referrer_id'),
      anomalies: rows.map(
        (r: { referrerId: string; referredId: string; total: number }) => ({
          referrerId: r.referrerId,
          referredId: r.referredId,
          rewardClaimedTimes: r.total,
          action: 'Review referral anti-abuse rules; reverse duplicate reward payouts',
        }),
      ),
      summary:
        rows.length > 0
          ? `${rows.length} referral relationship(s) rewarded more than once`
          : 'No duplicate paid referral claims',
    };
  }

  private async checkStaleUnreadNotifications(
    until: Date,
  ): Promise<DataQualityCheckOutcome> {
    const cutoff = new Date(until.getTime() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.dataSource.query(
      `SELECT id, "userId", "createdAt"
         FROM in_app_notifications
        WHERE "readAt" IS NULL AND "createdAt" < $1
        LIMIT 50`,
      [cutoff],
    );
    return {
      jobName: 'notifications.stale_unread',
      tableName: 'in_app_notifications',
      severity: DataQualitySeverity.INFO,
      checkedCount: await this.countAll('in_app_notifications', 'id'),
      anomalies: rows.map((r: { id: string; userId: string; createdAt: Date }) => ({
        notificationId: r.id,
        userId: r.userId,
        createdAt: r.createdAt,
        action: 'Mark as expired so inactive inboxes do not grow unbounded',
      })),
      summary:
        rows.length > 0
          ? `${rows.length} in-app notification(s) unread for more than 90 days`
          : 'No stale unread notifications',
    };
  }

  private async checkStuckDeliveries(until: Date): Promise<DataQualityCheckOutcome> {
    const cutoff = new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const rows = await this.dataSource.query(
      `SELECT id, "notificationId", status, attempts, "errorMessage"
         FROM notification_delivery_logs
        WHERE status IN ('pending', 'failed')
          AND attempts < 3
          AND ("attemptedAt" IS NULL OR "attemptedAt" < $1)
        LIMIT 50`,
      [cutoff],
    );
    return {
      jobName: 'deliveries.stuck_pending',
      tableName: 'notification_delivery_logs',
      severity: DataQualitySeverity.HIGH,
      checkedCount: await this.countAll('notification_delivery_logs', 'id'),
      anomalies: rows.map(
        (r: {
          id: string;
          notificationId: string;
          status: string;
          attempts: number;
          errorMessage: string | null;
        }) => ({
          deliveryLogId: r.id,
          notificationId: r.notificationId,
          status: r.status,
          attempts: r.attempts,
          error: r.errorMessage,
          action: 'Re-run the delivery sweep or escalate to ops if it persists',
        }),
      ),
      summary:
        rows.length > 0
          ? `${rows.length} delivery log(s) stuck retryable for more than 24h`
          : 'No stuck delivery logs',
    };
  }

  private async checkStaleRewardTransactions(
    until: Date,
  ): Promise<DataQualityCheckOutcome> {
    const cutoff = new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const rows = await this.dataSource.query(
      `SELECT id, "userId", status, attempts, "errorMessage"
         FROM reward_transactions
        WHERE status IN ('PENDING', 'FAILED')
          AND attempts >= 3
          AND "updatedAt" < $1
        LIMIT 50`,
      [cutoff],
    );
    return {
      jobName: 'rewards.stale_pending',
      tableName: 'reward_transactions',
      severity: DataQualitySeverity.HIGH,
      checkedCount: await this.countAll('reward_transactions', 'id'),
      anomalies: rows.map(
        (r: {
          id: string;
          userId: string;
          status: string;
          attempts: number;
          errorMessage: string | null;
        }) => ({
          transactionId: r.id,
          userId: r.userId,
          status: r.status,
          attempts: r.attempts,
          error: r.errorMessage,
          action: 'Retry the payout or flag the transaction for reconciliation',
        }),
      ),
      summary:
        rows.length > 0
          ? `${rows.length} reward transaction(s) exhausted attempts without settling`
          : 'No stale reward transactions',
    };
  }

  private async checkInvalidRewardAmounts(): Promise<DataQualityCheckOutcome> {
    const rows = await this.dataSource.query(
      `SELECT id, amount::text AS amount
         FROM reward_transactions
        WHERE amount <= 0
        LIMIT 50`,
    );
    return {
      jobName: 'rewards.invalid_amount',
      tableName: 'reward_transactions',
      severity: DataQualitySeverity.CRITICAL,
      checkedCount: await this.countAll('reward_transactions', 'amount'),
      anomalies: rows.map((r: { id: string; amount: string }) => ({
        transactionId: r.id,
        amount: r.amount,
        action: 'Block such amounts at the payout boundary; reconcile this record',
      })),
      summary:
        rows.length > 0
          ? `${rows.length} reward transaction(s) with non-positive amounts`
          : 'No invalid reward amounts',
    };
  }

  private async countAll(table: string, column: string): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT COUNT("${column}")::int AS total FROM ${table}`,
    );
    return Number(row?.total ?? 0);
  }
}