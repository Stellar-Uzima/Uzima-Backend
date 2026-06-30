import {
  Injectable,
} from "@nestjs/common";

import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";

import { RedisService }
  from "../../redis/redis.service";

@Injectable()
export class RedisHealthIndicator
  extends HealthIndicator {

  constructor(
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async isHealthy(
    key = "redis",
  ): Promise<HealthIndicatorResult> {

    try {

      await this.redisService.ping();

      return this.getStatus(
        key,
        true,
      );

    } catch (error) {

      throw new HealthCheckError(
        "Redis check failed",
        this.getStatus(
          key,
          false,
        ),
      );
    }
  }
}