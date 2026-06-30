import {
  Injectable,
} from "@nestjs/common";

import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";

import { QueueService }
  from "../../queue/queue.service";

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

      return this.getStatus(
        key,
        true,
      );

    } catch {

      throw new HealthCheckError(
        "Queue check failed",
        this.getStatus(
          key,
          false,
        ),
      );
    }
  }
}