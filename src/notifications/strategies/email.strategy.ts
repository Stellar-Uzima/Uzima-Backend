import { NotificationStrategy } from './notification-strategy.interface';

export class EmailStrategy implements NotificationStrategy {
  async deliver(payload: unknown): Promise<void> {
    void payload;
  }
}
