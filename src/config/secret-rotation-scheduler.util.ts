import { Injectable, Logger } from '@nestjs/common';
import { SecretsService } from './secrets';

/**
 * Periodically reloads/rotates secrets for critical external integrations
 * so long-lived processes don't keep using stale credentials.
 */
@Injectable()
export class SecretRotationScheduler {
  private readonly logger = new Logger(SecretRotationScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly secretsService: SecretsService,
    private readonly integrationKeys: string[] = ['stellarSigningKey', 'jwtSecret'],
  ) {}

  start(intervalMs = 24 * 60 * 60 * 1000): void {
    this.timer = setInterval(() => this.reloadAll(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async reloadAll(): Promise<void> {
    for (const key of this.integrationKeys) {
      try {
        await this.secretsService.rotateSecret(key);
        this.logger.log(`Reloaded secret for integration: ${key}`);
      } catch (err) {
        this.logger.warn(`Failed to reload secret for ${key}: ${(err as Error).message}`);
      }
    }
  }
}
