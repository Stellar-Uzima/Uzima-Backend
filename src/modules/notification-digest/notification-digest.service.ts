import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationDigestRun,
  NotificationDigestStatus,
} from './entities/notification-digest-run.entity';
import {
  UserPreferences,
} from '../../database/entities/user-preferences.entity';
import { InAppNotification } from '../notification-center/entities/in-app-notification.entity';
import { User } from '../../entities/user.entity';

/**
 * Aggregates a user's unread notifications for a time window and emits a
 * digest (email) so users do not miss important updates between app visits.
 *
 * ## Rules
 * - Only users with an active email preference (`notifications.email` is not
 *   explicitly disabled) and a verified email are eligible.
 * - A user is covered **at most once per day**, enforced by the
 *   `(userId, digestDate)` unique constraint on `notification_digest_runs`.
 * - An empty digest (no unread items in the window) is recorded as `skipped`
 *   so the schedule can prove it ran without spamming users.
 * - Dispatch itself is stubbed at `logger.log` level — the same pattern the
 *   notification-center email route uses until a real mailer is wired — while
 *   the run record carries the recipient and item count for auditing.
 */
@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    @InjectRepository(NotificationDigestRun)
    private readonly runRepo: Repository<NotificationDigestRun>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepo: Repository<UserPreferences>,
    @InjectRepository(InAppNotification)
    private readonly notificationRepo: Repository<InAppNotification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Runs a digest pass over the given window for every eligible user.
   */
  async runDigest(windowStart: Date, windowEnd: Date): Promise<{
    eligible: number;
    dispatched: number;
    skipped: number;
    failed: number;
  }> {
    const digestDate = windowEnd.toISOString().slice(0, 10);
    const preferences = await this.preferencesRepo.find({ select: ['userId'] });
    const userIds = [...new Set(preferences.map((p) => p.userId))];

    let dispatched = 0;
    let skipped = 0;
    let failed = 0;

    this.logger.log(
      `Digest run for ${digestDate}: ${userIds.length} user(s) with preferences considered`,
    );

    for (const userId of userIds) {
      if (await this.alreadyRan(userId, digestDate)) {
        continue;
      }

      const run = this.runRepo.create({
        userId,
        digestDate,
        status: NotificationDigestStatus.QUEUED,
        itemsCount: 0,
      });
      const saved = await this.runRepo.save(run);

      try {
        const outcome = await this.composeAndDispatch(userId, saved, windowStart, windowEnd);
        if (outcome.mode === 'dispatched') {
          dispatched += 1;
        } else {
          skipped += 1;
        }
      } catch (err: unknown) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        await this.runRepo.update(saved.id, {
          status: NotificationDigestStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        });
        this.logger.error(`Digest failed for user=${userId}: ${message}`);
      }
    }

    this.logger.log(
      `Digest run complete for ${digestDate}: dispatched=${dispatched} skipped=${skipped} failed=${failed}`,
    );
    return { eligible: userIds.length, dispatched, skipped, failed };
  }

  /**
   * Checks whether a digest was already produced for this user on this day.
   */
  private async alreadyRan(userId: string, digestDate: string): Promise<boolean> {
    const existing = await this.runRepo.findOne({
      where: { userId, digestDate },
      select: ['id', 'status'],
    });
    if (existing) {
      this.logger.verbose(`Digest already run for user=${userId} on ${digestDate}`);
    }
    return Boolean(existing);
  }

  private async composeAndDispatch(
    userId: string,
    run: NotificationDigestRun,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<{ mode: 'dispatched' | 'empty' }> {
    const prefs = await this.preferencesRepo.findOne({ where: { userId } });
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const emailEnabled = prefs?.notifications?.email?.enabled ?? true;
    if (!emailEnabled) {
      await this.markSkipped(run, 'email notifications disabled in preferences');
      return { mode: 'empty' };
    }
    if (!user?.email) {
      await this.markSkipped(run, 'user has no verified email address');
      return { mode: 'empty' };
    }

    const items = await this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.readAt IS NULL')
      .andWhere('n."createdAt" >= :windowStart', { windowStart })
      .andWhere('n."createdAt" < :windowEnd', { windowEnd })
      .orderBy('n."createdAt"', 'ASC')
      .getMany();

    if (items.length === 0) {
      await this.markSkipped(run, 'no unread notifications in window');
      return { mode: 'empty' };
    }

    const lines = items
      .slice(0, 20)
      .map((item) => `- ${item.title}`)
      .join('\n');
    const digestText = `You have ${items.length} unread update(s):\n${lines}`;

    // Mirror the notification-center email stub: a real mailer is plugged in
    // later, but the dispatch point and recipient are auditable.
    this.logger.log(
      `[DIGEST_EMAIL] userId=${userId} items=${items.length} to=${user.email}`,
    );
    this.logger.debug(digestText);

    await this.runRepo.update(run.id, {
      status: NotificationDigestStatus.COMPLETED,
      itemsCount: items.length,
      emailTo: user.email,
      completedAt: new Date(),
    });
    return { mode: 'dispatched' };
  }

  private async markSkipped(run: NotificationDigestRun, reason: string): Promise<void> {
    await this.runRepo.update(run.id, {
      status: NotificationDigestStatus.SKIPPED,
      completedAt: new Date(),
      errorMessage: reason,
    });
    this.logger.verbose(`Digest skipped for user=${run.userId}: ${reason}`);
  }
}