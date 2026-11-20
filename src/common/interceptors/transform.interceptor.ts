import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
  /**
   * Intercepts the outgoing route handler response stream and wraps or transforms
   * the emitted data into the standard API response envelope.
   *
   * @param context - The NestJS execution context for the current request.
   * @param next - The call handler providing access to the underlying route execution stream.
   * @returns An observable emitting the transformed response payload.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // ...existing implementation
  }
}
