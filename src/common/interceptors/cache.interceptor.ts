import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../../shared/cache/cache.service';
import {
  CACHE_KEY_METADATA,
  CACHE_INVALIDATE_METADATA,
} from '../decorators/cache.decorator';

/**
 * Interceptor that automatically caches GET endpoint responses
 * and invalidates cache on write operations.
 * 
 * Features:
 * - Automatic caching of GET requests with @Cache decorator
 * - Cache key generation with dynamic parameter substitution
 * - Automatic invalidation on POST/PUT/DELETE with @CacheInvalidate
 * - Graceful fallback on cache errors
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Handle cache invalidation for write operations
    const invalidatePatterns = this.reflector.get<string[]>(
      CACHE_INVALIDATE_METADATA,
      context.getHandler(),
    );

    if (invalidatePatterns && invalidatePatterns.length > 0) {
      return this.handleInvalidation(next, invalidatePatterns, request);
    }

    // Handle caching for GET requests
    const cacheMetadata = this.reflector.get<{ key: string; ttl: number }>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    if (method === 'GET' && cacheMetadata) {
      return this.handleCaching(next, cacheMetadata, request, context);
    }

    return next.handle();
  }

  private handleCaching(
    next: CallHandler,
    cacheMetadata: { key: string; ttl: number },
    request: any,
    context: ExecutionContext,
  ): Observable<any> {
    const cacheKey = this.generateCacheKey(cacheMetadata.key, request, context);

    // Try to get from cache first
    return new Observable((observer) => {
      this.cacheService.get(cacheKey).then((cached) => {
        if (cached !== null) {
          this.logger.debug(`Cache hit: ${cacheKey}`);
          observer.next(cached);
          observer.complete();
          return;
        }

        // Cache miss - proceed with handler
        this.logger.debug(`Cache miss: ${cacheKey}`);
        next.handle().pipe(
          tap((data) => {
            // Cache the response
            this.cacheService.set(cacheKey, data, { ttl: cacheMetadata.ttl })
              .catch((error) => this.logger.error(`Failed to cache response: ${error.message}`));
          }),
          catchError((error) => {
            // On error, still try to return stale data if available
            this.cacheService.get(cacheKey).then((stale) => {
              if (stale !== null) {
                this.logger.warn(`Returning stale data for ${cacheKey} due to error`);
                observer.next(stale);
                observer.complete();
              } else {
                observer.error(error);
              }
            }).catch(() => observer.error(error));
            
            return of(error);
          })
        ).subscribe(observer);
      }).catch((error) => {
        // If cache fails, proceed without caching
        this.logger.error(`Cache get failed: ${error.message}`);
        next.handle().subscribe(observer);
      });
    });
  }

  private handleInvalidation(
    next: CallHandler,
    patterns: string[],
    request: any,
  ): Observable<any> {
    return next.handle().pipe(
      tap(async () => {
        for (const pattern of patterns) {
          const resolvedPattern = this.generateCacheKey(pattern, request, null);
          try {
            const count = await this.cacheService.clearPattern(resolvedPattern);
            if (count > 0) {
              this.logger.log(`Invalidated ${count} cache keys matching pattern: ${resolvedPattern}`);
            }
          } catch (error) {
            this.logger.error(`Failed to invalidate cache pattern ${resolvedPattern}: ${error.message}`);
          }
        }
      })
    );
  }

  private generateCacheKey(
    template: string,
    request: any,
    context: ExecutionContext | null,
  ): string {
    let key = template;

    // Replace route parameters (e.g., :id)
    if (request.params) {
      Object.entries(request.params).forEach(([param, value]) => {
        key = key.replace(`:${param}`, String(value));
      });
    }

    // Replace query parameters (e.g., :limit, :page)
    if (request.query) {
      Object.entries(request.query).forEach(([param, value]) => {
        key = key.replace(`:${param}`, String(value));
      });
    }

    // Replace user context (e.g., :userId)
    if (request.user?.id || request.user?.userId) {
      const userId = request.user?.id || request.user?.userId;
      key = key.replace(':userId', String(userId));
      key = key.replace('{userId}', String(userId));
    }

    // Replace from method parameters if context is available
    if (context) {
      const args = context.getArgs();
      if (args && args.length > 0) {
        args.forEach((arg, index) => {
          if (arg && typeof arg === 'object') {
            Object.entries(arg).forEach(([param, value]) => {
              key = key.replace(`:${param}`, String(value));
              key = key.replace(`{${param}}`, String(value));
            });
          }
        });
      }
    }

    return key;
  }
}
