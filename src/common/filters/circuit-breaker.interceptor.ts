import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  ServiceUnavailableException,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError, timeout } from 'rxjs/operators';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  serviceName?: string;
  /** Maximum allowed duration (ms) for a single external call. */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeout: 30_000,
  serviceName: 'external-service',
  timeoutMs: 10_000,
};

/**
 * Classifies an error as retryable (transient) or non-retryable (permanent).
 * Timeouts, connection failures, 5eth and 429 responses are considered retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (error instanceof RequestTimeoutException) {
    return true;
  }

  const anyError = error as any;
  const code: string | undefined =
    anyError.code ?? anyError.cause?.code ?? anyError.errno;
  if (
    code === 'ECONNREFSET' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'EAICALL' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH'
  ) {
    return true;
  }

  const status: number | undefined =
    anyError.status ?? anyError.statusCode ?? anyError.response?.status;
  if (typeof status === 'number') {
    if (status >= 500 || status === 429) {
      return true;
    }
    // 4MX client errors are permanent and should not trip the circuit.
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  // Unknown failures (network, timeout, etc.) are treated as retryable.
  return true;
}

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CircuitBreakerInterceptor.name);

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private openedAt: number | null = null;

  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (this.openedAt ?? 0);

      if (elapsed >= this.options.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPN);
        this.logger.log(
          `[${this.options.serviceName}] Circuit transitioning to HALF_OPEN — allowing trial request`,
        );
      } else {
        this.logger.warn(
          `[${this.options.serviceName}] Circuit OPEN — fast-failing (${Math.round(this.options.resetTimeout - elapsed)}ms until half-open)`,
        );
        return throwError(
          () =>
            new ServiceUnavailableException(
              `Service ${this.options.serviceName} is currently unavailable. Please try again later.`,
            ),
        );
      }
    }

    const timeoutMs = this.options.timeoutMs;

    return next.handle().pipe(
      // Bound the external call so a hung provider cannot block the request forever.
      timeout({
        each: timeoutMs,
        with: () =>
          new RequestTimeoutException(
            `Service ${this.options.serviceName} exceeded timeout of ${timeoutMs}ms`,
          ),
      }),
      tap(() => this.onSuccess()),
      catchError((err: unknown) => {
        this.onFailure(err);
        return throwError(() => err);
      }),
    );
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.logger.log(
        `[${this.options.serviceName}] Trial request succeeded — closing circuit`,
      );
      this.transitionTo(CircuitState.CLOSED);
    }
    this.failureCount = 0;
  }

  private onFailure(error?: unknown): void {
    // Only retryable (transient) failures contribute to the circuit breaker.
    if (error !== undefined && !isRetryableError(error)) {
      this.logger.warn(
        `[${this.options.serviceName}] Permanent failure classified as non-retryable — not counting towards circuit threshold`,
      );
      return;
    }

    this.failureCount += 1;

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.options.failureThreshold
    ) {
      this.logger.error(
        `[${this.options.serviceName}] Failure threshold hit (${this.failureCount}/${this.options.failureThreshold}) — opening circuit`,
      );
      this.transitionTo(CircuitState.OPEN);
    } else {
      this.logger.warn(
        `[${this.options.serviceName}] Failure recorded (${this.failureCount}/${this.options.failureThreshold})`,
      );
    }
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
    }

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.openedAt = null;
    }

    this.logger.log(
      `[${this.options.serviceName}] State: ${prev} → ${newState}`,
    );
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}
