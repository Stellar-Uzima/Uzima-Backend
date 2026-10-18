import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MonitoringService } from '../../shared/monitoring/monitoring.service';
import { normalizeHttpMethod, normalizeRoute, normalizeStatusCode } from '../../shared/metrics/metrics.service';

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
