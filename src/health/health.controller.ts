import { Controller, Get } from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

import { RedisHealthIndicator } from './indicators/redis.health';

import { QueueHealthIndicator } from './indicators/queue.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,

    private readonly db: TypeOrmHealthIndicator,

    private readonly redis: RedisHealthIndicator,

    private readonly queue: QueueHealthIndicator
  ) {}

  /**
   * Liveness probe: process liveness only.
   * Does NOT check external dependencies (DB/Redis) so the process is not killed
   * during external dependency outages.
   */
  @Get('liveness')
  @HealthCheck()
  @ApiOperation({ summary: 'Process liveness probe' })
  @ApiResponse({ status: 200, description: 'Application process is alive' })
  getLiveness() {
    return this.health.check([
      () => ({
        process: {
          status: 'up',
          uptime: process.uptime(),
        },
      }),
    ]);
  }

  /**
   * Readiness probe: checks required dependencies (PostgreSQL and Redis).
   * Fails with 503 if either required dependency is unavailable.
   */
  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe for required dependencies' })
  @ApiResponse({ status: 200, description: 'All required dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more required dependencies are unavailable' })
  getReadiness() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1000 }),

      () => this.redis.isHealthy('redis', 1000),
    ]);
  }

  /**
   * Comprehensive health check preserving backwards compatibility with existing probes and alerts.
   * Verifies required dependencies and message queues.
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Comprehensive health check' })
  @ApiResponse({ status: 200, description: 'Service and dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unavailable' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1000 }),

      () => this.redis.isHealthy('redis', 1000),

      () => this.queue.isHealthy('queue'),
    ]);
  }

  @Get('redis')
  @HealthCheck()
  @ApiOperation({ summary: 'Check Redis connectivity' })
  @ApiResponse({ status: 200, description: 'Redis is healthy' })
  @ApiResponse({ status: 503, description: 'Redis is unreachable' })
  async checkRedis() {
    return this.health.check([() => this.redis.isHealthy('redis', 1000)]);
  }

  @Get('queue')
  @HealthCheck()
  @ApiOperation({ summary: 'Check queue health and job counts' })
  @ApiResponse({ status: 200, description: 'Queue is healthy' })
  @ApiResponse({ status: 503, description: 'Queue is unreachable' })
  async checkQueue() {
    return this.health.check([() => this.queue.isHealthy('queue')]);
  }
}
