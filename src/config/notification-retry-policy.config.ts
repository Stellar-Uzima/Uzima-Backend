import { registerAs } from '@nestjs/config';

/**
 * Policy for retrying notification provider delivery.
 *
 * Every value is configurable via environment variables with the
 * `NOTIFICATION_RETRY_*` / `NOTIFICATION_CIRCUIT_*` prefix, overriding the
 * defaults defined here. Reading through `ConfigService` keeps a single
 * source of truth for both `ChannelRouterService` and
 * `DeliverySweeperService`.
 *
 * Provider failure classification (see `classifyProviderFailure`):
 * - retryable: timeouts, network errors, HTTP 408/425/429/5xx. These are
 *   retried with exponential backoff until `maxAttempts` is reached.
 * - terminal: rejected requests (other 4xx such as invalid number, opt-out,
 *   malformed payload). These are never retried and are marked FAILED
 *   immediately.
 */
export interface NotificationRetryPolicy {
  /** Max delivery attempts before a failure becomes terminal. */
  maxAttempts: number;
  /** Base delay in ms; exponential backoff multiplies by 2 per attempt. */
  baseDelayMs: number;
  /**
   * What happens when attempts are exhausted on a transient failure.
   * - `escalate` — leave the log FAILED so the sweeper escalates it for review.
   * - `silent`   — mark FAILED without an operational alert.
   */
  terminalFailureStrategy: 'escalate' | 'silent';
  /** Consecutive provider failures before a channel circuit opens. */
  circuitFailureThreshold: number;
  /** Cooldown before a circuit allows a recovery probe. */
  circuitResetMs: number;
  /** How long a log may be stuck in PENDING/FAILED before the sweeper requeues. */
  staleMs: number;
  /** Max stale logs requeued per sweep run. */
  sweepBatch: number;
}

export type ProviderFailureKind = 'retryable' | 'terminal';

export interface ProviderFailureClassification {
  kind: ProviderFailureKind;
  reason: string;
}

/** HTTP statuses that indicate a transient condition worth retrying. */
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Error codes that indicate timeouts or transient network failures. */
const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'ESOCKETTIMEDOUT',
]);

/**
 * Classify an SMS provider error as retryable or terminal.
 *
 * Accepts loosely-typed provider errors so it works across vendor SDKs:
 * an HTTP `status`/`statusCode`/`response.status`, a Node `code`, a
 * `timeout` flag, or an error `name` of `TimeoutError`/`AbortError`.
 */
export function classifyProviderFailure(error: unknown): ProviderFailureClassification {
  const err = (error ?? {}) as {
    name?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    timeout?: boolean;
    response?: { status?: number };
  };

  if (
    err.timeout === true ||
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    (typeof err.code === 'string' && RETRYABLE_ERROR_CODES.has(err.code))
  ) {
    return { kind: 'retryable', reason: 'timeout_or_network' };
  }

  const status = err.status ?? err.statusCode ?? err.response?.status;
  if (typeof status === 'number') {
    if (RETRYABLE_HTTP_STATUSES.has(status)) {
      return { kind: 'retryable', reason: `http_${status}` };
    }
    if (status >= 400 && status < 500) {
      return { kind: 'terminal', reason: `rejected_http_${status}` };
    }
    if (status >= 500) {
      return { kind: 'retryable', reason: `http_${status}` };
    }
  }

  // Unknown errors are treated as retryable so transient vendor faults are not lost.
  return { kind: 'retryable', reason: 'unknown' };
}

export default registerAs(
  'notification',
  (): NotificationRetryPolicy => ({
    maxAttempts: parseInt(process.env.NOTIFICATION_RETRY_MAX_ATTEMPTS ?? '3', 10) || 3,
    baseDelayMs: parseInt(process.env.NOTIFICATION_RETRY_BASE_DELAY_MS ?? '1000', 10) || 1000,
    terminalFailureStrategy:
      process.env.NOTIFICATION_RETRY_TERMINAL_FAILURE_STRATEGY === 'silent'
        ? 'silent'
        : 'escalate',
    circuitFailureThreshold:
      parseInt(process.env.NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD ?? '5', 10) || 5,
    circuitResetMs: parseInt(process.env.NOTIFICATION_CIRCUIT_RESET_MS ?? '30000', 10) || 30000,
    staleMs: parseInt(process.env.NOTIFICATION_DELIVERY_STALE_MS ?? '300000', 10) || 300000,
    sweepBatch: parseInt(process.env.NOTIFICATION_SWEEP_BATCH ?? '200', 10) || 200,
  }),
);
