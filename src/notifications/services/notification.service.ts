import { NotificationStrategy } from '../strategies/notification-strategy.interface';
import { EmailStrategy } from '../strategies/email.strategy';
import { SmsStrategy } from '../strategies/sms.strategy';
import { PushStrategy } from '../strategies/push.strategy';

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, baseDelayMs: 500 };

export class NotificationService {
  private strategies: Record<string, NotificationStrategy> = {
    email: new EmailStrategy(),
    sms: new SmsStrategy(),
    push: new PushStrategy(),
  };

  private fallbackOrder: string[] = ['push', 'sms', 'email'];

  async send(channel: string, payload: unknown, retry: RetryConfig = DEFAULT_RETRY): Promise<void> {
    const strategy = this.strategies[channel];
    if (!strategy) throw new Error(`Unknown notification channel: ${channel}`);

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      try {
        await strategy.deliver(payload);
        return;
      } catch (err) {
        if (attempt === retry.maxAttempts) {
          await this.fallback(channel, payload, retry);
          return;
        }
        await this.delay(retry.baseDelayMs * attempt);
      }
    }
  }

  /**
   * Convenience wrappers used by callers such as the GDPR export job.
   * They route through the strategy pipeline via `send`.
   */
  async sendEmail(
    userId: string,
    template: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await this.send('email', { userId, template, ...data });
  }

  private async fallback(
    failedChannel: string,
    payload: unknown,
    retry: RetryConfig
  ): Promise<void> {
    const next = this.fallbackOrder.find((c) => c !== failedChannel);
    if (!next) throw new Error('All notification channels exhausted');
    await this.send(next, payload, retry);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
