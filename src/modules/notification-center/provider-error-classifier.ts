/**
 * Provider error classification for notification delivery.
 *
 * A permanent failure is deterministic — it will never succeed on the same
 * input (invalid recipient, bad credentials, missing configuration). Retrying
 * it wastes resources and delays the terminal-failure signal.
 *
 * A transient failure may succeed on a subsequent attempt (network hiccup,
 * 5xx from the provider, rate limiting, our own circuit breaker).
 */

/** Error codes that indicate a deterministic, non-retryable provider failure. */
export const PERMANENT_PROVIDER_ERROR_CODES = new Set([
  'ERR_BAD_REQUEST',
  'ERR_UNAUTHORIZED',
  'ERR_FORBIDDEN',
  'ERR_NOT_FOUND',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
  'OUT_OF_RANGE',
  'ALREADY_EXISTS',
]);

/**
 * Determine whether a provider error should be treated as permanent.
 *
 * Returns `true` only when the error carries a clear signal that retrying
 * will not change the outcome. Anything ambiguous (or with no signal) is
 * treated as transient so the existing retry/backoff pipeline handles it.
 */
export function isPermanentProviderError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const e = err as {
    code?: string;
    status?: number;
    statusCode?: number;
    message?: string;
  };

  // Our own circuit-breaker signal: retryable after cooldown, never permanent.
  if (e.code === 'NOTIFICATION_CIRCUIT_OPEN') return false;

  if (typeof e.code === 'string' && PERMANENT_PROVIDER_ERROR_CODES.has(e.code)) {
    return true;
  }

  // HTTP status codes: 4xx client errors are permanent, 5xx are transient.
  const status = e.status ?? e.statusCode;
  if (typeof status === 'number') {
    if (status >= 400 && status < 500) return true;
    if (status >= 500) return false;
  }

  const msg = e.message ?? '';

  // FCM: registration token problems are permanent.
  if (/unregistered|invalid registration|not registered|mismatch sender/i.test(msg)) {
    return true;
  }

  // Twilio: invalid destination / bad credentials are permanent.
  if (/Invalid (phone|number|destination)|not a valid phone number|invalid `to`/i.test(msg)) {
    return true;
  }

  // Missing recipient data is deterministic — retrying cannot create it.
  if (/has no (email address|phone number|FCM token)/i.test(msg)) {
    return true;
  }

  // Missing provider configuration is permanent (retrying won't conjure creds).
  if (/not configured|missing.*credentials|Twilio SMS is not configured/i.test(msg)) {
    return true;
  }

  return false;
}

/**
 * True when a permanent failure should NOT be retried — the delivery is
 * already failed and the error is deterministic.
 */
export function isTerminalProviderError(err: unknown): boolean {
  return isPermanentProviderError(err);
}
