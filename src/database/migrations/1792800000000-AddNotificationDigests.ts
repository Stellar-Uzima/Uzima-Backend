import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationDigests1792800000000 implements MigrationInterface {
  name = 'AddNotificationDigests1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS notification_digests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,                       -- REPLACE type to match users.id
        frequency varchar(16) NOT NULL CHECK (frequency IN ('daily','weekly')),
        window_start timestamptz NOT NULL,
        window_end timestamptz NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','sent','failed','skipped')),
        item_count integer NOT NULL DEFAULT 0,
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uniq_digest_user_window UNIQUE (user_id, frequency, window_start)
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_digest_status ON notification_digests (status, updated_at)`);
    // REPLACE "notifications" with the real table name:
    await q.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS digest_id uuid REFERENCES notification_digests(id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_notifications_digest ON notifications (digest_id)`);
    // Only if preferences do not already store these (skip these two lines if they do).
    // REPLACE "notification_preferences" with the real table name:
    await q.query(`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS digest_frequency varchar(16) NOT NULL DEFAULT 'off'`);
    await q.query(`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS digest_categories text[] NOT NULL DEFAULT '{}'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE notification_preferences DROP COLUMN IF EXISTS digest_categories`);
    await q.query(`ALTER TABLE notification_preferences DROP COLUMN IF EXISTS digest_frequency`);
    await q.query(`DROP INDEX IF EXISTS idx_notifications_digest`);
    await q.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS digest_id`);
    await q.query(`DROP TABLE IF EXISTS notification_digests`);
  }
}