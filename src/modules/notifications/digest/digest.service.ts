import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { digestWindow } from './digest-window';
import {
  DIGEST,
  DIGEST_SENDER,
  DigestFrequency,
  DigestSender,
} from './digest.constants';

export interface DigestRunSummary {
  sent: number;
  failed: number;
  skipped: number;
  ignored: number;
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(DIGEST_SENDER) private readonly sender: DigestSender,
  ) {}

  async run(frequency: DigestFrequency, now: Date = new Date()): Promise<DigestRunSummary> {
    const summary: DigestRunSummary = { sent: 0, failed: 0, skipped: 0, ignored: 0 };
    const window = digestWindow(frequency, now);

    // Users whose saved preferences ask for this frequency and at least one category.
    const users: Array<{ user_id: string; categories: string[] }> = await this.dataSource.query(
      `/* digest:users */
       SELECT ${DIGEST.prefsUserId} AS user_id, ${DIGEST.prefsCategories} AS categories
       FROM ${DIGEST.prefsTable}
       WHERE ${DIGEST.prefsFrequency} = $1 AND cardinality(${DIGEST.prefsCategories}) > 0`,
      [frequency],
    );

    for (const user of users) {
      try {
        const result = await this.processUser(frequency, user.user_id, user.categories, window);
        summary[result] += 1;
      } catch (error) {
        // One user's failure must never stop the rest of the batch.
        summary.failed += 1;
        this.logger.error(`Digest failed for a user: ${(error as Error).message}`);
      }
    }
    this.logger.log(`Digest run (${frequency}) ${JSON.stringify(summary)}`);
    return summary;
  }

  private async processUser(
    frequency: DigestFrequency,
    userId: string,
    categories: string[],
    window: { start: Date; end: Date },
  ): Promise<'sent' | 'failed' | 'skipped' | 'ignored'> {
    const digest = await this.claim(userId, frequency, window);
    if (!digest) return 'ignored'; // already sent/skipped, in progress, or out of attempts

    try {
      // Attach this window's items to the digest (items already in a digest are never re-sent).
      await this.dataSource.query(
        `/* digest:claim-items */
         UPDATE ${DIGEST.notificationsTable} SET digest_id = $5
         WHERE ${DIGEST.notifUserId} = $1 AND ${DIGEST.notifCategory} = ANY($2::text[])
           AND ${DIGEST.notifCreatedAt} >= $3 AND ${DIGEST.notifCreatedAt} < $4
           AND digest_id IS NULL`,
        [userId, categories, window.start, window.end, digest.id],
      );

      const rows: Array<Record<string, any>> = await this.dataSource.query(
        `/* digest:items */
         SELECT id, ${DIGEST.notifCategory} AS category, ${DIGEST.notifTitle} AS title,
                ${DIGEST.notifBody} AS body, ${DIGEST.notifCreatedAt} AS created_at
         FROM ${DIGEST.notificationsTable}
         WHERE digest_id = $1 ORDER BY ${DIGEST.notifCreatedAt} LIMIT $2`,
        [digest.id, DIGEST.MAX_ITEMS],
      );

      if (rows.length === 0) {
        await this.dataSource.query(
          `/* digest:mark-skipped */
           UPDATE notification_digests SET status = 'skipped', item_count = 0, updated_at = now() WHERE id = $1`,
          [digest.id],
        );
        return 'skipped';
      }

      await this.sender.send({
        userId,
        frequency,
        windowStart: window.start,
        windowEnd: window.end,
        items: rows.map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          body: r.body,
          createdAt: r.created_at,
        })),
      });

      await this.dataSource.query(
        `/* digest:mark-sent */
         UPDATE notification_digests
         SET status = 'sent', item_count = $2, sent_at = now(), last_error = NULL, updated_at = now()
         WHERE id = $1`,
        [digest.id, rows.length],
      );
      return 'sent';
    } catch (error) {
      await this.dataSource.query(
        `/* digest:mark-failed */
         UPDATE notification_digests SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`,
        [digest.id, String((error as Error).message ?? error).slice(0, 500)],
      );
      return 'failed';
    }
  }

  /**
   * Atomically take ownership of this user's digest for the window.
   * First tries to create it; otherwise re-claims a failed or stuck one that still has attempts left.
   */
  private async claim(userId: string, frequency: DigestFrequency, window: { start: Date; end: Date }) {
    const created: Array<{ id: string }> = await this.dataSource.query(
      `/* digest:claim-insert */
       WITH ins AS (
         INSERT INTO notification_digests (user_id, frequency, window_start, window_end, attempts)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (user_id, frequency, window_start) DO NOTHING
         RETURNING id
       ) SELECT id FROM ins`,
      [userId, frequency, window.start, window.end],
    );
    if (created.length) return created[0];

    const reclaimed: Array<{ id: string }> = await this.dataSource.query(
      `/* digest:reclaim */
       WITH upd AS (
         UPDATE notification_digests
         SET status = 'pending', attempts = attempts + 1, updated_at = now()
         WHERE user_id = $1 AND frequency = $2 AND window_start = $3 AND attempts < $4
           AND (status = 'failed'
                OR (status = 'pending' AND updated_at < now() - make_interval(mins => $5)))
         RETURNING id
       ) SELECT id FROM upd`,
      [userId, frequency, window.start, DIGEST.MAX_ATTEMPTS, DIGEST.STALE_PENDING_MINUTES],
    );
    return reclaimed[0] ?? null;
  }
}
