import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async sendNotification(userId: string, notification: { title: string; message: string; type: string }): Promise<void> {
    this.logger.log(`Notification sent to ${userId}: ${notification.title}`);
  }
}