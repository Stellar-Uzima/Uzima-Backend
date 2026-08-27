import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  serviceName?: string;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeout: 30_000,
  serviceName: 'external-service',
};

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CircuitBreakerInterceptor.name);

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private openedAt: number | null = null;

  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (this.openedAt ?? 0);

      if (elapsed >= this.options.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
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

    return next.handle().pipe(
      tap(() => this.onSuccess()),
      catchError((err: unknown) => {
        this.onFailure();
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

  private onFailure(): void {
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
