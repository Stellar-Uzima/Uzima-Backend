import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retryWhen, switchMap } from 'rxjs/operators';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringService?: any;
}

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private readonly logger = console;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000,
      monitoringService: options.monitoringService ?? null,
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (this.state === 'OPEN') {
      return throwError(
        () =>
          new HttpException(
            'Service unavailable - circuit breaker open',
            HttpStatus.SERVICE_UNAVAILABLE,
          ),
      );
    }

    return next.handle().pipe(
      retryWhen((errors) =>
        errors.pipe(
          switchMap((error, i) => {
            this.recordFailure();
            if (this.state === 'OPEN') {
              return throwError(
                () =>
                  new HttpException(
                    'Service unavailable - circuit breaker open',
                    HttpStatus.SERVICE_UNAVAILABLE,
                  ),
              );
            }
            return timer(this.options.resetTimeout);
          }),
        ),
      ),
      catchError((error) => {
        this.recordFailure();
        return throwError(() => error);
      }),
    );
  }

  private recordFailure(): void {
    this.failureCount += 1;
    if (this.state === 'CLOSED' && this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.failureCount = 0;
      this.logger.warn('Circuit breaker opened due to failures');
    }
  }

  transitionToHalfOpen(): void {
    if (this.state === 'OPEN') {
      this.state = 'HALF_OPEN';
      this.failureCount = 0;
    }
  }

  closeCircuit(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
  }

  openCircuit(): void {
    this.state = 'OPEN';
    this.failureCount = 0;
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
  }
}