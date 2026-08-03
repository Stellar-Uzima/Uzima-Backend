import { NotificationStrategy } from './notification-strategy.interface';

export class SmsStrategy implements NotificationStrategy {
  async deliver(payload: unknown): Promise<void> {
    void payload;
  }
}
