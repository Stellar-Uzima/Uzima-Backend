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
 * Service-Level Monitoring Targets (SLO definitions)
 *
 * Measurement window: rolling 30 days.
 *
 * Endpoint scope:
 *   - GET /health            (aggregate liveness/readiness of core dependencies)
 *   - GET /health/queue      (queue reachability)
 *   - GET /health/scheduled-jobs (critical schedule freshness)
 *
 * Targets:
 *   - Availability (HTTP 200 responses / total requests): >= 99.9%
 *     Error threshold: non-200 responses (excluding planned maintenance) < 0.1%
 *   - Latency (p95 response time):   <= 300 ms
 *   - Latency (p99 response time):   <= 800 ms
 *   - Dependency checks:            database, redis, queue, scheduled_jobs must
 *                                    report healthy; any unhealthy check is an
 *                                    error event counted against availability.
 *   - Scheduled jobs:               no critical schedule missed or delayed beyond
 *                                    its configured tolerance window.
 *
 * Dashboards and alerts must reference these targets. Alerts fire when the
 * error budget burn rate exceeds 2x over a 1-hour window or 1x over a 6-hour
 * window. Each incident must be reviewed post-mortem against these targets
 * and the targets revised if they proved unrealistic or insufficient.
 */
export const SERVICE_LEVEL_TARGETS = {
  measurementWindow: "30d",
  endpoints: ["/health", "/health/queue", "/health/scheduled-jobs"],
  availabilityTarget: 0.999,
  maxErrorRate: 0.001,
  latencyP95ThresholdMs: 300,
  latencyP99ThresholdMs: 800,
  alerting: {
    fastBurnRate: { multiplier: 2, window: "1h" },
    slowBurnRate: { multiplier: 1, window: "6h" },
  },
  postIncidentReview: true,
} as const;

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
  @ApiOperation({ summary: 'Check queue health and job counts' })
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
      'Check scheduled job health, last successful execution and status',
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
