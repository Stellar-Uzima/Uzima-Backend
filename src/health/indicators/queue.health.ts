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

/**
  * Retry and dead-letter policy configuration for queued jobs.
  */
export interface JobRetryPolicy {
  /** Maximum number of retry attempts after the initial attempt. */
  maxRetries: number;
  /** Base delay between retries, in milliseconds. */
  backoffMs: number;
  /** Multiplier applied per attempt for exponential backoff. Defaults to 2. */
  backoffMultiplier?: number;
  /** Maximum backoff delay, in milliseconds. */
  maxBackoffMs?: number;
}

export interface JobRetryState {
  jobName: string;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  deadLettered: boolean;
}

export interface DeadLetterRecord {
  jobName: string;
  attempts: number;
  lastError: string;
  failedAt: string;
  context?: Record<string, unknown>;
}

export const DEFAULT_FAILURE_THRESHOLD = 3;

export const DEFAULT_RETRY_POLICY: JobRetryPolicy = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 60_000,
};

export const HISTORY_REFET = "scheduled-job:history";
export const RETRY_STATE_KEY = "scheduled-job:retry-state";
export const DEAD_LETTER_KEY = "scheduled-job:dead-letter";

@Injectable()
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
   * Resolves the retry policy for a job type, falling back to the shared
   * default policy when no override is provided.
   */
  resolveRetryPolicy(
    jobName: string,
    overrides?: Record<string, JobRetryPolicy>,
  ): JobRetryPolicy {
    const policy = overrides?.[jobName] ?? DEFAULT_RETRY_POLICY;
    return {
      maxRetries: Math.max(0, policy.maxRetries),
      backoffMs: Math.max(0, policy.backoffMs),
      backoffMultiplier: Math.max(1, policy.backoffMultiplier ?? 2),
      maxBackoffMs: Math.max(0, policy.maxBackoffMs ?? 60_000),
    };
  }

  /**
   * Computes the exponential backoff delay for a given attempt count.
   */
  computeBackoffMs(attempts: number, policy: JobRetryPolicy): number {
    const multiplier = policy.backoffMultiplier ?? 2;
    const max = policy.maxBackoffMs ?? 60_000;
    const raw = policy.backoffMs * Math.pow(multiplier, Math.max(0, attempts - 1));
    return Math.min(raw, max);
  }

  /**
   * Records a failed attempt and decides whether the job should be retried or
   * moved to the dead-letter queue. Returns the resulting retry state.
   */
  async recordFailedAttempt(
    jobName: string,
    error: string,
    overrides?: Record<string, JobRetryPolicy>,
    context?: Record<string, unknown>,
  ): Promise<JobRetryState> {
    const policy = this.resolveRetryPolicy(jobName, overrides);
    const states = await this.readRetryStates();
    const now = Date.now();
    const existing = states[jobName] ?? {
      jobName,
      attempts: 0,
      deadLettered: false,
    };

    existing.attempts += 1;
    existing.lastError = error;
    existing.lastAttemptAt = now;

    if (existing.attempts > policy.maxRetries) {
      existing.deadLettered = true;
      existing.nextRetryAt = undefined;
      await this.appendDeadLetter({
        jobName,
        attempts: existing.attempts,
        lastError: error,
        failedAt: new Date(now).toISOString(),
        context: this.sanitizeContext(context),
      });
    } else {
      existing.deadLettered = false;
      existing.nextRetryAt = now + this.computeBackoffMs(existing.attempts, policy);
    }

    states[jobName] = existing;
    await this.writeRetryStates(states);
    return existing;
  }

  /**
   * Returns the retained dead-letter records for authorized review.
   */
  async getDeadLetterRecords(): Promise<DeadLetterRecord[]> {
    const raw = await this.queueService.getKey(DEAD_LETTER_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as DeadLetterRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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
        yetToRun: false,
      };
    });
  }

  /**
   * Returns the latest retry state for each known job type.
   */
  async getRetryStates(): Promise<Record<string, JobRetryState>> {
    return this.readRetryStates();
  }

  private async readHistory(): Promise<Record<string, {
    jobName: string;
    lastSuccessfulExecution: number | null;
    consecutiveFailures: number;
    lastError?: string;
  }>> {
    const raw = await this.queueService.getKey(HISTORY_REFET);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeHistory(history: Record<string, unknown>): Promise<void> {
    await this.queueService.setKey(HISTORY_REFET, JSON.stringify(history));
  }

  private async readRetryStates(): Promise<Record<string, JobRetryState>> {
    const raw = await this.queueService.getKey(RETRY_STATE_KEY);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private async writeRetryStates(states: Record<string, JobRetryState>): Promise<void> {
    await this.queueService.setKey(RETRY_STATE_KEY, JSON.stringify(states));
  }

  private async appendDeadLetter(record: DeadLetterRecord): Promise<void> {
    const raw = await this.queueService.getKey(DEAD_LETTER_KEY);
    let records: DeadLetterRecord[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        records = Array.isArray(parsed) ? parsed : [];
      } catch {
        records = [];
      }
    }
    records.push(record);
    await this.queueService.setKey(DEAD_LETTER_KEY, JSON.stringify(records));
  }

  /**
   * Strips potentially sensitive fields from job context before retaining it.
   */
  private sanitizeContext(
    context?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!context) {
      return undefined;
    }
    const sensitive = /(password|secret|token|apikey|authorization|credential)/i;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      out[key] = sensitive.test(key) ? "[REDACTED]" : value;
    }
    return out;
  }
}
