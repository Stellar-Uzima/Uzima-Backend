import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { performance } from 'node:perf_hooks';

type RedisStatus = {
  status: 'up' | 'down';
  responseTime: number;
};

@Injectable()
export class RedisHealthIndicator {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = performance.now();

    try {
      await this.redis.ping();

      return {
        [key]: {
          status: 'up',
          responseTime: Math.round(performance.now() - start),
        } satisfies RedisStatus,
      };
    } catch (error) {
      const result = {
        [key]: {
          status: 'down',
          responseTime: Math.round(performance.now() - start),
        } satisfies RedisStatus,
      };

      throw new HealthCheckError(
        error instanceof Error ? error.message : 'Redis health check failed',
        result,
      );
    }
  }
}
