import {
  Injectable,
} from "@nestjs/common";

import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";

import { CacheService }
  from "../../shared/cache/cache.service";

@Injectable()
export class RedisHealthIndicator
  extends HealthIndicator {

  constructor(
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async isHealthy(
    key = "redis",
  ): Promise<HealthIndicatorResult> {

    try {
      await this.cacheService.ping();
      const stats = await this.cacheService.getCacheStats();

      return this.getStatus(
        key,
        true,
        {
          ...stats,
          message: "Redis connection is healthy",
          timestamp: new Date().toISOString(),
        },
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      throw new HealthCheckError(
        "Redis check failed",
        this.getStatus(
          key,
          false,
          {
            error: errorMessage,
            timestamp: new Date().toISOString(),
          },
        ),
      );
    }
  }
}