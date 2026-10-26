import { registerAs } from '@nestjs/config';

/**
 * Policy for retrying notification provider delivery.
 *
 * Every value is configurable via environment variables with the
 * `NOTIFICATION_RETRY_*` / `NOTIFICATION_CIRCUIT_*` prefix, overriding the
 * defaults defined here. Reading through `ConfigService` keeps a single
 * source of truth for both `ChannelRouterService` and
 * `DeliverySweeperService`.
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
