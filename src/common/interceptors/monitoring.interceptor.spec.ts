import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MonitoringInterceptor } from './monitoring.interceptor';

describe('MonitoringInterceptor', () => {
  const monitoringService = {
    monitorPerformance: jest.fn(),
  };

  const interceptor = new MonitoringInterceptor(monitoringService as any);

  const createContext = (statusCode = 200) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/health',
          route: { path: '/health' },
        }),
        getResponse: () => ({ statusCode }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records metrics after successful requests', (done) => {
    const next: CallHandler = { handle: () => of({ ok: true }) };

    interceptor.intercept(createContext(200), next).subscribe({
      complete: () => {
        expect(monitoringService.monitorPerformance).toHaveBeenCalledWith(
          '/health',
          'GET',
          expect.any(Number),
          200,
        );
        done();
      },
    });
  });

  it('records metrics after failed requests', (done) => {
    const next: CallHandler = {
      handle: () => throwError(() => new Error('failure')),
    };

    interceptor.intercept(createContext(500), next).subscribe({
      error: () => {
        expect(monitoringService.monitorPerformance).toHaveBeenCalledWith(
          '/health',
          'GET',
          expect.any(Number),
          500,
        );
        done();
      },
    });
  });
});
