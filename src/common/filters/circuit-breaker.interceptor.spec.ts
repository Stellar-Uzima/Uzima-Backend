/**
 * @jest-environment node
 */

import { ExecutionContext, CallHandler, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { CircuitBreakerInterceptor, CircuitState } from './circuit-breaker.interceptor';

const mockContext = {} as ExecutionContext;

const successHandler: CallHandler = { handle: () => of({ ok: true }) };
const failHandler: CallHandler = {
  handle: () => throwError(() => new Error('upstream error')),
};

describe('CircuitBreakerInterceptor', () => {
  const THRESHOLD = 3;
  const RESET_TIMEOUT = 300;

  let interceptor: CircuitBreakerInterceptor;

  beforeEach(() => {
    interceptor = new CircuitBreakerInterceptor({
      failureThreshold: THRESHOLD,
      resetTimeout: RESET_TIMEOUT,
      serviceName: 'test-service',
    });
  });

  // ── initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      expect(interceptor.getState()).toBe(CircuitState.CLOSED);
    });

    it('starts with zero failure count', () => {
      expect(interceptor.getFailureCount()).toBe(0);
    });
  });

  // ── CLOSED behaviour ───────────────────────────────────────────────────────

  describe('CLOSED state', () => {
    it('passes a successful request through', (done) => {
      interceptor.intercept(mockContext, successHandler).subscribe({
        next: (val) => expect(val).toEqual({ ok: true }),
        complete: done,
      });
    });

    it('re-throws upstream errors without opening below threshold', (done) => {
      interceptor.intercept(mockContext, failHandler).subscribe({
        error: (err) => {
          expect(err.message).toBe('upstream error');
          expect(interceptor.getState()).toBe(CircuitState.CLOSED);
          done();
        },
      });
    });

    it('increments failure count on each error', (done) => {
      interceptor.intercept(mockContext, failHandler).subscribe({
        error: () => {
          expect(interceptor.getFailureCount()).toBe(1);
          done();
        },
      });
    });
  });

  // ── threshold-triggered OPEN ───────────────────────────────────────────────

  describe('opening the circuit on failure threshold', () => {
    function triggerFailures(count: number, cb: () => void) {
      let remaining = count;
      for (let i = 0; i < count; i++) {
        interceptor.intercept(mockContext, failHandler).subscribe({
          error: () => {
            remaining -= 1;
            if (remaining === 0) cb();
          },
        });
      }
    }

    it('transitions to OPEN after failureThreshold consecutive failures', (done) => {
      triggerFailures(THRESHOLD, () => {
        expect(interceptor.getState()).toBe(CircuitState.OPEN);
        done();
      });
    });

    it('fast-fails with ServiceUnavailableException while OPEN', (done) => {
      triggerFailures(THRESHOLD, () => {
        interceptor.intercept(mockContext, successHandler).subscribe({
          error: (err) => {
            expect(err).toBeInstanceOf(ServiceUnavailableException);
            done();
          },
        });
      });
    });

    it('does not call the upstream handler while OPEN', (done) => {
      const spy = jest.fn().mockReturnValue(of({ ok: true }));
      const spyHandler: CallHandler = { handle: spy };

      triggerFailures(THRESHOLD, () => {
        interceptor.intercept(mockContext, spyHandler).subscribe({
          error: () => {
            expect(spy).not.toHaveBeenCalled();
            done();
          },
        });
      });
    });
  });

  // ── HALF_OPEN trial request ────────────────────────────────────────────────

  describe('HALF_OPEN after reset timeout', () => {
    function openThenWait(cb: () => void) {
      let remaining = THRESHOLD;
      for (let i = 0; i < THRESHOLD; i++) {
        interceptor.intercept(mockContext, failHandler).subscribe({
          error: () => {
            remaining -= 1;
            if (remaining === 0) {
              setTimeout(cb, RESET_TIMEOUT + 50);
            }
          },
        });
      }
    }

    it('closes the circuit when the trial request succeeds', (done) => {
      openThenWait(() => {
        interceptor.intercept(mockContext, successHandler).subscribe({
          complete: () => {
            expect(interceptor.getState()).toBe(CircuitState.CLOSED);
            expect(interceptor.getFailureCount()).toBe(0);
            done();
          },
        });
      });
    });

    it('re-opens the circuit when the trial request fails', (done) => {
      openThenWait(() => {
        interceptor.intercept(mockContext, failHandler).subscribe({
          error: () => {
            expect(interceptor.getState()).toBe(CircuitState.OPEN);
            done();
          },
        });
      });
    });
  });

  // ── reset helper ───────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('forces circuit back to CLOSED from OPEN', (done) => {
      let remaining = THRESHOLD;
      for (let i = 0; i < THRESHOLD; i++) {
        interceptor.intercept(mockContext, failHandler).subscribe({
          error: () => {
            remaining -= 1;
            if (remaining === 0) {
              interceptor.reset();
              expect(interceptor.getState()).toBe(CircuitState.CLOSED);
              expect(interceptor.getFailureCount()).toBe(0);
              done();
            }
          },
        });
      }
    });

    it('allows normal traffic after a reset', (done) => {
      let remaining = THRESHOLD;
      for (let i = 0; i < THRESHOLD; i++) {
        interceptor.intercept(mockContext, failHandler).subscribe({
          error: () => {
            remaining -= 1;
            if (remaining === 0) {
              interceptor.reset();
              interceptor.intercept(mockContext, successHandler).subscribe({
                next: (val) => expect(val).toEqual({ ok: true }),
                complete: done,
              });
            }
          },
        });
      }
    });
  });
});
