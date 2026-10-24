import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DigestService } from './digest.service';

/**
 * Safe to run on several instances: the unique (user, frequency, window) key means a
 * second instance finds the digest already claimed and skips it.
 */
@Injectable()
export class DigestScheduler {
  constructor(private readonly digests: DigestService) {}

  @Cron('0 7 * * *', { name: 'notification-digest-daily', timeZone: 'UTC' })
  async daily() {
    await this.digests.run('daily');
  }

  @Cron('0 7 * * 1', { name: 'notification-digest-weekly', timeZone: 'UTC' })
  async weekly() {
    await this.digests.run('weekly');
  }
}
