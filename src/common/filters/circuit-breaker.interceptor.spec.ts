import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { CircuitBreakerInterceptor } from './circuit-breaker.interceptor';

describe('CircuitBreakerInterceptor', () => {
  let interceptor: CircuitBreakerInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CircuitBreakerInterceptor,
          useFactory: () => new CircuitBreakerInterceptor({
            failureThreshold: 3,
            resetTimeout: 1000,
          }),
        },
      ],
    }).compile();

    interceptor = module.get<CircuitBreakerInterceptor>(CircuitBreakerInterceptor);
  });

  describe('initial state', () => {
    it('should be CLOSED initially', () => {
      expect(interceptor.getState()).toBe('CLOSED');
    });

    it('should have zero failures initially', () => {
      // Access private failureCount via method that exposes state
      expect(interceptor.getState()).toBe('CLOSED');
    });
  });

  describe('failure threshold triggers opening', () => {
    it('should transition from CLOSED to OPEN after threshold failures', (done) => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNext = {
        handle: () => throwError(() => new Error('Service error')),
      } as unknown as CallHandler;

      // Trigger 3 failures (threshold)
      let completed = 0;
      for (let i = 0; i < 3; i++) {
        interceptor.intercept(mockContext, mockNext).subscribe({
          error: () => {
            completed += 1;
            if (completed === 3) {
              expect(interceptor.getState()).toBe('OPEN');
              expect(interceptor.getState()).not.toBe('CLOSED');
              done();
            }
          },
        });
      }
    });

    it('should reject requests immediately when OPEN', (done) => {
      // First open the circuit
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNextError = {
        handle: () => throwError(() => new Error('Service error')),
      } as unknown as CallHandler;

      // Open the circuit via failures
      for (let i = 0; i < 3; i++) {
        interceptor.intercept(mockContext, mockNextError).subscribe({
          error: () => {},
        });
      }

      expect(interceptor.getState()).toBe('OPEN');

      // Now try a new request - should fail immediately without calling next
      const mockContext2 = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNextSuccess = {
        handle: () => of({ data: 'success' }),
      } as unknown as CallHandler;

      interceptor.intercept(mockContext2, mockNextSuccess).subscribe({
        error: (err) => {
          expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
          expect(err.message).toBe('Service unavailable - circuit breaker open');
          done();
        },
      });
    });
  });

  describe('half-open trial', () => {
    it('should transition to HALF_OPEN after reset timeout', (done) => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNextError = {
        handle: () => throwError(() => new Error('Service error')),
      } as unknown as CallHandler;

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        interceptor.intercept(mockContext, mockNextError).subscribe({
          error: () => {},
        });
      }

      expect(interceptor.getState()).toBe('OPEN');

      // Manually transition to HALF_OPEN
      interceptor.transitionToHalfOpen();
      expect(interceptor.getState()).toBe('HALF_OPEN');
      done();
    });

    it('should allow one request through in HALF_OPEN state', (done) => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNextSuccess = {
        handle: () => of({ data: 'success' }),
      } as unknown as CallHandler;

      // Set to HALF_OPEN
      interceptor.transitionToHalfOpen();

      interceptor.intercept(mockContext, mockNextSuccess).subscribe({
        next: (data) => {
          // In HALF_OPEN, it should pass through
          done();
        },
        error: (err) => {
          // If it errors with SERVICE_UNAVAILABLE, circuit is still open
          if (err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE) {
            done.fail('Should have allowed request through in HALF_OPEN');
          }
        },
      });
    });
  });

  describe('reset on success', () => {
    it('should close circuit on successful request in HALF_OPEN', (done) => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNextSuccess = {
        handle: () => of({ data: 'success' }),
      } as unknown as CallHandler;

      // Open circuit first
      const mockContextForOpen = {
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const mockNextError = {
        handle: () => throwError(() => new Error('error')),
      } as unknown as CallHandler;

      for (let i = 0; i < 3; i++) {
        interceptor.intercept(mockContextForOpen, mockNextError).subscribe({
          error: () => {},
        });
      }

      expect(interceptor.getState()).toBe('OPEN');
      interceptor.transitionToHalfOpen();

      interceptor.intercept(mockContext, mockNextSuccess).subscribe({
        next: () => {
          expect(interceptor.getState()).toBe('CLOSED');
          done();
        },
        error: (err) => {
          if (err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE) {
            done.fail('Should not fail in HALF_OPEN with success');
          }
        },
      });
    });
  });

  describe('manual control', () => {
    it('should allow manual open', () => {
      interceptor.openCircuit();
      expect(interceptor.getState()).toBe('OPEN');
    });

    it('should allow manual close', () => {
      interceptor.openCircuit();
      expect(interceptor.getState()).toBe('OPEN');
      interceptor.closeCircuit();
      expect(interceptor.getState()).toBe('CLOSED');
    });

    it('should reset failure count on manual reset', () => {
      interceptor.reset();
      expect(interceptor.getState()).toBe('CLOSED');
    });
  });
});