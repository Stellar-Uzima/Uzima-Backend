import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhookService } from './webhook.service';

@Injectable()
export class WebhookRetryScheduler {
  constructor(private readonly webhookService: WebhookService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  retryDueWebhooks(): Promise<number> {
    return this.webhookService.retryDue();
  }
}
