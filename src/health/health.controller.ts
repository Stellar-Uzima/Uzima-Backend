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
