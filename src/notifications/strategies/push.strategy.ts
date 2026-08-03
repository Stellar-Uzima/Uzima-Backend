import { NotificationStrategy } from './notification-strategy.interface';

export class PushStrategy implements NotificationStrategy {
  async deliver(payload: unknown): Promise<void> {
    void payload;
  }
}
