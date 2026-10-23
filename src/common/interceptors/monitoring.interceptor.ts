import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MonitoringService } from '../../shared/monitoring/monitoring.service';
import { normalizeHttpMethod, normalizeRoute, normalizeStatusCode } from '../../shared/metrics/metrics.service';

/**
 * Service-Level Monitoring Targets (Issue 150)
 *
 * Measurement window: rolling 30 days, evaluated per route and HTTP method.
 * Endpoint scope: all router-templated API routes. Requests without a router
 * template (e.g. 404s) are recorded under a single normalized bucket and are
 * excluded from latency targets.
 * Availability target: 99.9% of requests return a non-5xx status code.
 * Latency target: p95 response time <= 500 ms, p99 <= 1500 ms.
 * Error threshold: alert when the 5xx rate exceeds 0.1% over a 5 minute window.
 *
 * Dashboards and alerts consume the metrics emitted by this interceptor and
 * must be reviewed after each incident against these targets.
 */
@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  constructor(private readonly monitoringService: MonitoringService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const start = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const duration = Date.now() - start;
        const method = normalizeHttpMethod(request.method);
        // Without a router template (for example a 404), do not use the raw
        // path: it may contain user supplied IDs or arbitrary strings.
        const route = normalizeRoute(request.route?.path || '');
        const statusCode = normalizeStatusCode(response.statusCode || 500);

        void this.monitoringService.monitorPerformance(route, method, duration, statusCode);
      }),
    );
  }
}
