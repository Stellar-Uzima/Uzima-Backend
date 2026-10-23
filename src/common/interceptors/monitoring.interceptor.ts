import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MonitoringService } from '../../shared/monitoring/monitoring.service';
import { normalizeHttpMethod, normalizeRoute, normalizeStatusCode } from '../../shared/metrics/metrics.service';

/**
 * Service-Level Monitoring Targets (Issue 150)
 *
 * Measurement window: rolling 30-day window, evaluated per endpoint.
 * Endpoint scope: all router-templated API routes. Requests without a router
 * template (e.g. 404s) are recorded under a normalized, non-identifying route
 * label so that they count toward availability but never create per-path
 * cardinality.
 *
 * Targets:
 * - Availability: >= 99.9% of requests return a non-5xx status code.
 * - Error rate: 5xx responses <= 0.1% of requests (alert when > 0.5% over 15m).
 * - Latency: p95 <= 500ms, p99 <= 1500ms per route.
 *
 * Dashboards and alerts are built from the metrics emitted by this interceptor
 * and must reference these thresholds. Targets are reviewed after every
 * incident that breaches them.
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
