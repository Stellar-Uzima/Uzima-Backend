import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MonitoringService } from '../../shared/monitoring/monitoring.service';

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
        const method = request.method;
        const route = request.route?.path || request.url;
        const statusCode = response.statusCode || 500;

        void this.monitoringService.monitorPerformance(route, method, duration, statusCode);
      }),
    );
  }
}
