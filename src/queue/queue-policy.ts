/**
 * Shared retry and dead-letter policy.
 *
 * The backoff a job is enqueued with, the check that decides it has exhausted
 * its attempts, and the record written when a job is dead-lettered all live
 * here so they cannot drift apart. The Bull-backed `QueueService`, the reward
 * processor / dead-letter processor and the in-process `DeferredTaskQueue` all
 * read their limits from this module.
 */

/** Default attempts (initial try + retries) for a queue job. */
export const DEFAULT_JOB_ATTEMPTS = 3;

/** Base delay (ms) for exponential backoff — the pause before the first retry. */
export const DEFAULT_BACKOFF_MS = 1000;

/**
 * Hard cap (ms) on a single backoff delay, so a job that has been retried many
 * times cannot schedule the next attempt hours into the future.
 */
export const MAX_BACKOFF_MS = 60_000;

/** How a failure is classified, so dead letters can be grouped by root cause. */
export type FailureCategory =
  | 'timeout'
  | 'network'
  | 'rate-limit'
  | 'validation'
  | 'contract'
  | 'unknown';

/** Every category, in report order. Keeps summary objects shape-stable. */
export const FAILURE_CATEGORIES: FailureCategory[] = [
  'timeout',
  'network',
  'rate-limit',
  'validation',
  'contract',
  'unknown',
];

/** A zeroed counter per category, for building failure summaries. */
export function emptyFailureCategoryCounts(): Record<FailureCategory, number> {
  return {
    timeout: 0,
    network: 0,
    'rate-limit': 0,
    validation: 0,
    contract: 0,
    unknown: 0,
  };
}

/**
 * Exponential backoff with a hard cap.
 *
 * `attempt` is the 1-based retry number: `attempt = 1` is the pause before the
 * first retry and returns `baseMs`, `attempt = 2` returns `2 * baseMs`, and so
 * on until `maxMs`. The schedule is deterministic on purpose — tests assert it,
 * and incident timelines are easier to reconstruct without jitter.
 */
export function computeBackoffDelay(
  attempt: number,
  baseMs: number = DEFAULT_BACKOFF_MS,
  maxMs: number = MAX_BACKOFF_MS,
): number {
  const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : DEFAULT_BACKOFF_MS;
  const safeMax = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : MAX_BACKOFF_MS;
  const retryIndex = Math.max(1, Math.floor(attempt)) - 1;
  const delay = safeBase * 2 ** Math.min(retryIndex, 30);
  return Math.min(Math.max(delay, safeBase), safeMax);
}

/** True when no attempts remain, i.e. `attemptsMade` has reached `maxAttempts`. */
export function isRetryExhausted(
  attemptsMade: number,
  maxAttempts: number = DEFAULT_JOB_ATTEMPTS,
): boolean {
  const attempts =
    Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : DEFAULT_JOB_ATTEMPTS;
  const made = Number.isFinite(attemptsMade) ? Math.floor(attemptsMade) : 0;
  return made >= attempts;
}

/** Failure messages that mean the transport never reached its destination. */
const NETWORK_FAILURE_PATTERN =
  /econnrefused|econnreset|enotfound|eai_again|socket hang up|network|fetch failed/;

/** Classify a failure message so operators can group dead letters by root cause. */
export function classifyFailure(message: string | undefined | null): FailureCategory {
  const text = (message ?? '').toLowerCase();
  if (text.trim().length === 0) return 'unknown';
  if (/timeout|timed out|etimedout/.test(text)) return 'timeout';
  if (/rate.?limit|too many requests|\b429\b/.test(text)) return 'rate-limit';
  if (NETWORK_FAILURE_PATTERN.test(text)) return 'network';
  if (/validation|invalid|bad request|\b400\b/.test(text)) return 'validation';
  if (/contract|soroban|stellar|insufficient|\btx_/.test(text)) return 'contract';
  return 'unknown';
}

export interface DeadLetterRecord {
  originalQueue: string;
  originalJobId: string;
  originalJobName: string;
  originalData: unknown;
  failedReason: string;
  failureCategory: FailureCategory;
  attemptsMade: number;
  maxAttempts: number;
  stacktrace: string[];
  timestamp?: number;
  failedAt: number;
}

/**
 * Build the payload written to the dead-letter queue.
 *
 * Pure and synchronous so the record an operator will later inspect can be
 * asserted without a Redis instance.
 */
export function buildDeadLetterRecord(input: {
  queueName: string;
  jobId: string;
  jobName: string;
  jobData: unknown;
  reason?: string;
  attemptsMade: number;
  maxAttempts?: number;
  stacktrace?: string[];
  timestamp?: number;
  now?: number;
}): DeadLetterRecord {
  const reason =
    input.reason && input.reason.trim().length > 0 ? input.reason : 'Unknown failure';
  return {
    originalQueue: input.queueName,
    originalJobId: input.jobId,
    originalJobName: input.jobName,
    originalData: input.jobData,
    failedReason: reason,
    failureCategory: classifyFailure(reason),
    attemptsMade: input.attemptsMade,
    maxAttempts: input.maxAttempts ?? DEFAULT_JOB_ATTEMPTS,
    stacktrace: input.stacktrace ?? [],
    timestamp: input.timestamp,
    failedAt: input.now ?? Date.now(),
  };
}
