import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheckError,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  async check() {
    const details: Record<string, unknown> = {};
    let hasFailure = false;

    try {
      Object.assign(details, await this.db.pingCheck('db'));
    } catch (error) {
      hasFailure = true;
      details.db =
        error instanceof HealthCheckError
          ? error.causes.db
          : {
              status: 'down',
            };
    }

    try {
      Object.assign(details, await this.redis.isHealthy('redis'));
    } catch (error) {
      hasFailure = true;
      details.redis =
        error instanceof HealthCheckError
          ? error.causes.redis
          : {
              status: 'down',
            };
    }

    if (hasFailure) {
      const payload = {
        status: 'error',
        ...details,
      };

      this.logger.error(`Health check failed: ${JSON.stringify(payload)}`);
      throw new ServiceUnavailableException(payload);
    }

    return {
      status: 'ok',
      ...details,
    };
  }
}
