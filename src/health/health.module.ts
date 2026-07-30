import {
  Module,
} from "@nestjs/common";

import {
  TerminusModule,
} from "@nestjs/terminus";

import {
  HealthController,
} from "./health.controller";

import {
  RedisHealthIndicator,
} from "./indicators/redis.health";

import {
  QueueHealthIndicator,
} from "./indicators/queue.health";

import {
  CacheModule,
} from "../shared/cache/cache.module";

import {
  QueueModule,
} from "../queue/queue.module";

@Module({
  imports: [
    TerminusModule,
    CacheModule,
    QueueModule,
  ],

  controllers: [
    HealthController,
  ],

  providers: [
    RedisHealthIndicator,
    QueueHealthIndicator,
  ],
})
export class HealthModule {}