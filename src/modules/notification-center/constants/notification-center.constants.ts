export const NOTIFICATION_CENTER_QUEUE = 'notification-center-retry-queue' as const;
export const RETRY_DELIVERY_JOB = 'retry-channel-delivery' as const;

/** Max delivery attempts before a channel is marked permanently failed. */
export const MAX_DELIVERY_ATTEMPTS = 3;

/** Base backoff delay in milliseconds for exponential retry (1 s, 2 s, 4 s). */
export const RETRY_BASE_DELAY_MS = 1_000;
