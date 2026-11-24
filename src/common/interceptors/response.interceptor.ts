import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponseEnvelope<T> {
  success: true;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponseEnvelope<T>>
{
  /**
   * Wraps the value emitted by the route handler in the standard
   * {@link ApiResponseEnvelope}, adding a `success: true` flag and an ISO-8601
   * `timestamp` taken when the response is produced.
   *
   * Errors are not touched: an exception thrown by the handler propagates
   * through the stream unchanged and is handled by the exception filters.
   *
   * @param _context - The execution context of the current request. Unused,
   *   because the envelope does not depend on request details.
   * @param next - The call handler that runs the route handler and exposes its
   *   response as an observable stream.
   * @returns An observable that emits the handler's data wrapped in an
   *   {@link ApiResponseEnvelope}.
   */
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseEnvelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
