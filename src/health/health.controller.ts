import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";

import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";

import {
  RedisHealthIndicator,
} from "./indicators/redis.health";

import {
  QueueHealthIndicator,
} from "./indicators/queue.health";

import {
  ScheduledJobHealthIndicator,
} from "./indicators/scheduled-job.health";

/**
 * Service-Level Monitoring Targets (Issue 150)
 *
 * Measurement window: rolling 30 days, evaluated per 5-minute health probe bucket.
 *
 * Endpoint scope:
 *   - GET /health              (core dependencies: database, redis, queue, scheduled_jobs)
 *   - GET /health/queue        (queue reachability and job counts)
 *   - GET /health/scheduled-jobs (critical schedule freshness and failure state)
 *
 * Targets:
 *   - Availability (/health):            >= 99.9% of probes return HTTP 200 per window
 *                                        (error budget: ~43 minutes/30 days)
 *   - Latency (/health):                 p95 response time <= 500 ms, p99 <= 1500 ms
 *   - Availability (/health/queue):      >= 99.95% HTTP 200 per window
 *   - Latency (/health/queue):           p95 <= 300 ms
 *   - Availability (/health/scheduled-jobs): >= 99.9% HTTP 200 per window
 *   - Latency (/health/scheduled-jobs):  p95 <= 500 ms
 *   - Error threshold:                   any 5xx sustained for 3 consecutive probes
 *                                        (15 minutes) triggers an alert
 *
 * Dashboards and alerts are expected to reference these targets, and each
 * incident affecting a target must be reviewed against them in the postmortem.
 */
@ApiTags('Health')
@Controller("health")
export class HealthController {

  constructor(
    private readonly health: HealthCheckService,

    private readonly db:
      TypeOrmHealthIndicator,

    private readonly redis:
      RedisHealthIndicator,

    private readonly queue:
      QueueHealthIndicator,

    private readonly scheduledJobs:
      ScheduledJobHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary:
      'Core dependency health. SLO: 99.9% availability, p95 <= 500ms, p99 <= 1500ms over 30 days',
  })
  @ApiResponse({ status: 200, description: 'All core dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more core dependencies are unhealthy' })
  check() {

    return this.health.check([
      () =>
        this.db.pingCheck(
          "database",
        ),

      () =>
        this.redis.isHealthy(
          "redis",
        ),

      () =>
        this.queue.isHealthy(
          "queue",
        ),

      () =>
        this.scheduledJobs.isHealthy(
          "scheduled_jobs",
        ),
    ]);
  }

  @Get('queue')
  @HealthCheck()
  @ApiOperation({
    summary:
      'Check queue health and job counts. SLO: 99.95% availability, p95 <= 300ms over 30 days',
  })
  @ApiResponse({ status: 200, description: 'Queue is healthy' })
  @ApiResponse({ status: 503, description: 'Queue is unreachable' })
  async checkQueue() {
    return this.health.check([
      () => this.queue.isHealthy('queue'),
    ]);
  }

  @Get('scheduled-jobs')
  @HealthCheck()
  @ApiOperation({
    summary:
      'Check scheduled job health, last successful execution and status. SLO: 99.9% availability, p95 <= 500ms over 30 days',
  })
  @ApiResponse({
    status: 200,
    description:
      'All critical schedules are healthy',
  })
  @ApiResponse({
    status: 503,
    description:
      'One or more schedules are missed, delayed or repeatedly failing',
  })
  async checkScheduledJobs() {
    return this.health.check([
      () =>
        this.scheduledJobs.isHealthy(
          "scheduled_jobs",
        ),
    ]);
  }
}
