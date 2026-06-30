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

@Module({
  imports: [
    TerminusModule,
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