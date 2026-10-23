import { Injectable } from '@nestjs/common';

import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

import { CacheService } from '../../shared/cache/cache.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly cacheService: CacheService) {
    super();
  }

  async isHealthy(key = 'redis', timeoutMs = 1000): Promise<HealthIndicatorResult> {
    try {
      await this.pingWithTimeout(timeoutMs);

      return this.getStatus(key, true, {
        status: 'up',
        message: 'Redis connection is healthy',
      });
    } catch (error) {
      const sanitizedError = this.sanitizeError(error);

      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, {
          status: 'down',
          error: sanitizedError,
        })
      );
    }
  }

  private async pingWithTimeout(timeoutMs: number): Promise<boolean> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Redis health check timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    const pingPromise = this.cacheService.ping();
    // Attach an immediate no-op catch to prevent unhandled promise rejection if ping rejects after timeoutMs
    pingPromise.catch(() => {});

    try {
      return await Promise.race([pingPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private sanitizeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('timed out')) {
        return 'Redis health check timed out';
      }
      return 'Redis connection unavailable';
    }
    return 'Redis connection unavailable';
  }
}
