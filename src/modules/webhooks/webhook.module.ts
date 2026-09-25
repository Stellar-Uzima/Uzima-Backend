import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { WebhookRetryScheduler } from './webhook-retry.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), ScheduleModule.forRoot()],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookRetryScheduler],
  exports: [WebhookService],
})
export class WebhookModule {}
