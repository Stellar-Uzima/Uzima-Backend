import {
  Injectable,
} from "@nestjs/common";

import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";

import { QueueService }
  from "../../shared/queue/queue.service";

export interface ScheduledJobHealthStatus {
  jobName: string;
  lastSuccessfulExecution: string | null;
  currentStatus: "healthy" | "delayed" | "missed" | "failing";
  missedRuns: number;
  consecutiveFailures: number;
  alert?: string;
  yetToRun: boolean;
}

export interface ScheduledJobConfig {
  jobName: string;
  /** Maximum allowed gap between successful runs, in milliseconds. */
  expectedIntervalMs: number;
  /** Number of consecutive failures that triggers an alert. Defaults to 3. */
  failureThreshold?: number;
}

export interface ScheduledJobRunReport {
  jobName: string;
  success: boolean;
  executedAt: Date;
  error?: string;
}

export const DEFAULT_FAILURE_THRESHOLD = 3;

export const HISTORY_REFESH = "scheduled-job:history";

@injectable()
export class QueueHealthIndicator
  extends HealthIndicator {

  constructor(
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async isHealthy(
    key = "queue",
  ): Promise<HealthIndicatorResult> {

    try {
      await this.queueService.ping();
      const allQueueStats = await this.queueService.getAllQueueStats();

      return this.getStatus(
        key,
        true,
        {
          queues: allQueueStats,
          message: "All queue connections are healthy",
          timestamp: new Date().toISOString(),
        },
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      throw new HealthCheckError(
        "Queue check failed",
        this.getStatus(
          key,
          false,
          {
            error: errorMessage,
            timestamp: new Date().toISOString(),
          },
        ),
      );
    }
  }

  /**
   * Records the outcome of a scheduled job run so that health can be derived
   * from the latest successful execution and consecutive failure count.
   */
  async recordScheduledJobRun(
    report: ScheduledJobRunReport,
  ): Promise<void> {
    const history = await this.readHistory();
    const existing = history[report.jobName] ?? {
      jobName: report.jobName,
      lastSuccessfulExecution: null as number | null,
      consecutiveFailures: 0,
      lastError: undefined as string | undefined,
    };

    if (report.success) {
      existing.lastSuccessfulExecution = report.executedAt.getTime();
      existing.consecutiveFailures = 0;
      existing.lastError = undefined;
    } else {
      existing.consecutiveFailures += 1;
      existing.lastError = report.error;
    }

    history[report.jobName] = existing;
    await this.writeHistory(history);
  }

  /**
   * Evaluates each critical schedule and returns its last successful execution
   * and current status. Missed-delayed runs produce an alert with the job name
   * and the affected time window.
   */
  async checkScheduledJobs(
    configs: ScheduledJobConfig[],
    now = new Date(),
  ): Promise<ScheduledJobHealthStatus[]> {
    const history = await this.readHistory();

    return configs.map((config) => {
      const record = history[config.jobName];
      const failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
      const lastSuccess = record?.lastSuccessfulExecution ?? null;
      const consecutiveFailures = record?.consecutiveFailures ?? 0;

      if (lastSuccess === null) {
        return {
          jobName: config.jobName,
          lastSuccessfulExecution: null,
          currentStatus: "missed",
          missedRuns: 0,
          consecutiveFailures,
          alert: `${config.jobName} has no recorded successful execution yet`,
          yetToRun: true,
        };
      }

      const elapsed = now.getTime() - lastSuccess;
      const missedRuns =
        elapsed > config.expectedIntervalMs
          ? Math.floor(elapsed / config.expectedIntervalMs) - 1
          : 0;

      const windowStart = new Date(lastSuccess + config.expectedIntervalMs);
      const windowEnd = new Date(now.getTime());
      const window = `${windowStart.toISOString()} to ${windowEnd.toISOString()}`;

      if (consecutiveFailures >= failureThreshold) {
        return {
          jobName: config.jobName,
          lastSuccessfulExecution: new Date(lastSuccess).toISOString(),
          currentStatus: "failing",
          missedRuns,
          consecutiveFailures,
          alert: `${config.jobName} failed ${consecutiveFailures} consecutive times; affected window ${window}`,
          yetToRun: false,
        };
      }

      if (missedRuns > 0) {
        return {
          jobName: config.jobName,
          lastSuccessfulExecution: new Date(lastSuccess).toISOString(),
          currentStatus: "missed",
          missedRuns,
          consecutiveFailures,
          alert: `${config.jobName} missed ${missedRuns} run(s); affected window ${window}`,
          yetToRun: false,
        };
      }

      const delayed = elapsed > config.expectedIntervalMs * 0.8;
      return {
        jobName: config.jobName,
        lastSuccessfulExecution: new Date(lastSuccess).toISOString(),
        currentStatus: delayed ? "delayed" : "healthy",
        missedRuns,
        consecutiveFailures,
        alert: delayed
          ? `${config.jobName} is delayed; affected window ${window}`
          : undefined,
        yetToRun: false,
      };
    });
  }

  /**
   * Health indicator entrypoint for scheduled jobs. Reports unhealthy when any
   * critical schedule is missed or repeatedly failing.
   */
  async isScheduledJobsHealthy(
    configs: ScheduledJobConfig[],
    key = "scheduled_jobs",
  ): Promise<HealthIndicatorResult> {
    const statuses = await this.checkScheduledJobs(configs);
    const alerts = statuses.filter((s) => Boolean(s.alert));
    const healthy = alerts.length === 0;

    const payload = {
      jobs: statuses,
      alerts,
      timestamp: new Date().toISOString(),
    };

    if (!healthy) {
      throw new HealthCheckError(
        "Scheduled job check failed",
        this.getStatus(key, false, payload),
      );
    }

    return this.getStatus(key, true, payload);
  }

  private async readHistory(): Promise<Record<string, ScheduledJobHistoryRecord>> {
    const raw = await this.queueService.getKey(HISTORY_REFESH);
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, ScheduledJobHistoryRecord>;
    } catch {
      return {};
    }
  }

  private async writeHistory(
    history: Record<string, ScheduledJobHistoryRecord>,
  ): Promise<void> {
    await this.queueService.setKey(
      HISTORY_REFEENCE,
      JSON.stringify(history),
    );
  }
}

interface ScheduledJobHistoryRecord {
  jobName: string;
  lastSuccessfulExecution: number | null;
  consecutiveFailures: number;
  lastError?: string;
}
