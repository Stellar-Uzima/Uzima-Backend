/**
 * Wraps a query function and logs when it exceeds a latency threshold,
 * so slow search/filter queries can be identified and monitored over time.
 */
const DEFAULT_THRESHOLD_MS = 200;

export async function withSlowQueryLogging<T>(
  label: string,
  query: () => Promise<T>,
  thresholdMs: number = DEFAULT_THRESHOLD_MS,
): Promise<T> {
  const start = Date.now();
  try {
    return await query();
  } finally {
    const durationMs = Date.now() - start;
    if (durationMs > thresholdMs) {
      // eslint-disable-next-line no-console
      console.warn(
        `[slow-query] ${label} took ${durationMs}ms (threshold ${thresholdMs}ms)`,
      );
    }
  }
}
