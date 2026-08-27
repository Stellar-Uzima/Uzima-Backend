import {
  Injectable,
} from "@nestjs/common";

import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";

import { QueueService }
  from "../../shared/queue/queue.service";

@Injectable()
export class QueueHealthIndicator
  extends HealthIndicator {

  constructor(
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async isHealthy(
    key = "queue",
  ): Promise<HealthIndicatorResult> {

    try {
      await this.queueService.ping();
      const allQueueStats = await this.queueService.getAllQueueStats();

      return this.getStatus(
        key,
        true,
        {
          queues: allQueueStats,
          message: "All queue connections are healthy",
          timestamp: new Date().toISOString(),
        },
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      throw new HealthCheckError(
        "Queue check failed",
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