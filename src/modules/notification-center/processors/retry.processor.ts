import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ChannelRouterService, RetryJobData } from '../channel-router.service';
import {
  NOTIFICATION_CENTER_QUEUE,
  RETRY_DELIVERY_JOB,
} from '../constants/notification-center.constants';

@Processor(NOTIFICATION_CENTER_QUEUE)
export class RetryProcessor {
  private readonly logger = new Logger(RetryProcessor.name);

  constructor(private readonly channelRouter: ChannelRouterService) {}

  @Process(RETRY_DELIVERY_JOB)
  async handleRetry(job: Job<RetryJobData>): Promise<void> {
    const { notificationId, channel, attempt } = job.data;
    this.logger.log(
      `Processing retry: notificationId=${notificationId} channel=${channel} attempt=${attempt}`,
    );

    await this.channelRouter.retryDelivery(job.data);
  }

  @OnQueueFailed()
  onFailed(job: Job<RetryJobData>, err: Error): void {
    this.logger.error(
      `Retry job ${job.id} failed permanently: notificationId=${job.data.notificationId} channel=${job.data.channel}`,
      err.stack,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<RetryJobData>): void {
    this.logger.debug(
      `Retry job ${job.id} completed: notificationId=${job.data.notificationId} channel=${job.data.channel}`,
    );
  }
}
