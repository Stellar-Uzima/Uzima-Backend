import { Injectable, Logger, Optional } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Retry + circuit-breaker policy for a single downstream call.
 */
export interface RetryPolicyOptions {
  /** Maximum attempts including the first try (default 3). */
  attempts?: number;
  /** First backoff delay in ms (doubles per attempt, default 500). */
  baseDelayMs?: number;
  /** Ceiling for backoff in ms (default 8000). */
  maxDelayMs?: number;
  /** Per-call timeout in ms. When set, calls racing past it fail safely. */
  timeoutMs?: number;
  /** Add jitter to backoff to avoid thundering herds (default true). */
  jitter?: boolean;
  /** Circuit breaker; when set the service fails fast while a downstream is down. */
  circuit?: {
    /** Consecutive failures before the circuit opens (default 5). */
    failureThreshold?: number;
    /** How long the circuit stays open before a half-open probe (default 30000). */
    openDurationMs?: number;
  };
}

/**
 * Raised after all retries are exhausted (or while the circuit is open).
 * Callers should catch this and degrade gracefully rather than crashing.
 */
export class ThirdPartyApiError extends Error {
  constructor(
    message: string,
    public readonly downstream: string,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = 'ThirdPartyApiError';
  }
}

interface CircuitState {
  open: boolean;
  openedAt: number;
  failures: number;
  openDurationMs: number;
}

/**
 * Safe-handling layer for third-party API calls (#1375).
 *
 * Wraps every downstream interaction in:
 *  - a per-call **timeout** (no unbounded requests),
 *  - **exponential backoff with jitter** (no retry storms),
 *  - a **circuit breaker** keyed by downstream name (fail fast instead of
 *    hammering a broken provider),
 *  - typed `ThirdPartyApiError` escapes so owners can catch and degrade.
 *
 * State is in-memory per process; only used to smooth over transient
 * provider outages, not as a durable SLA.
 */
@Injectable()
export class ResilienceService {
  private readonly logger = new Logger(ResilienceService.name);
  private readonly circuits = new Map<string, CircuitState>();

  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  /**
   * Executes a downstream operation under the configured retry policy.
   */
  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options: RetryPolicyOptions = {},
  ): Promise<T> {
    const attempts = options.attempts ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 500;
    const maxDelayMs = options.maxDelayMs ?? 8000;
    const timeoutMs = options.timeoutMs;
    const circuit = options.circuit;

    if (circuit && this.isCircuitOpen(key, circuit.openDurationMs ?? 30_000)) {
      this.logger.warn(`Circuit OPEN for "${key}" — failing fast`);
      throw new ThirdPartyApiError(`Circuit open for ${key}`, key, 0);
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = timeoutMs
          ? await this.withTimeout(operation(), timeoutMs)
          : await operation();
        if (circuit) this.onSuccess(key);
        this.logger.debug(`Resilience call "${key}" OK on attempt ${attempt}`);
        return result;
      } catch (err: unknown) {
        lastError = err;
        if (circuit) this.onFailure(key, circuit.failureThreshold ?? 5, circuit.openDurationMs ?? 30_000);
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Resilience call "${key}" failed (${attempt}/${attempts}): ${message}`,
        );
        if (attempt < attempts) {
          const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
          const jitter = options.jitter === false ? 0 : Math.round(backoff * Math.random() * 0.4);
          await this.sleep(backoff + jitter);
        }
      }
    }

    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new ThirdPartyApiError(
      `Downstream "${key}" failed after ${attempts} attempts: ${reason}`,
      key,
      attempts,
    );
  }

  /**
   * Resolves a promise or rejects with a timeout error after `timeoutMs`.
   */
  async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private isCircuitOpen(key: string, openDurationMs: number): boolean {
    const state = this.circuits.get(key);
    if (!state) return false;
    if (state.open && Date.now() - state.openedAt >= state.openDurationMs) {
      // Half-open probe: allow a single attempt to re-check the provider.
      state.open = false;
      return false;
    }
    return state.open;
  }

  private onSuccess(key: string): void {
    const state = this.circuits.get(key);
    if (state) {
      state.open = false;
      state.failures = 0;
    }
  }

  private onFailure(key: string, threshold: number, openDurationMs: number): void {
    let state = this.circuits.get(key);
    if (!state) {
      state = { open: false, openedAt: 0, failures: 0, openDurationMs };
      this.circuits.set(key, state);
    }
    state.failures += 1;
    if (!state.open && state.failures >= threshold) {
      state.open = true;
      state.openedAt = Date.now();
      this.logger.error(
        `Operational alert: circuit OPEN for downstream "${key}" after ${state.failures} consecutive failures`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}