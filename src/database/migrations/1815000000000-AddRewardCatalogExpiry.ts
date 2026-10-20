import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds per-reward expiration handling to the reward catalog.
 *
 * - `reward_catalog.expires_at` (timestamptz, nullable): absolute expiry
 *   instant compared against UTC (`NOW()`), so expiry is time-zone
 *   independent — the stored instant is authoritative.
 * - Extends the `status` enum with `ARCHIVED` (soft delete target) and
 *   `EXPIRED`, then flips rows already at or past their expiry.
 *
 * A value added to a Postgres enum inside this migration's transaction cannot
 * be used until that transaction commits, so backfill runs first and only when
 * the label already exists; newly added labels are enforced at request time
 * afterwards (`RewardCatalogService` filters and rejects expired rewards).
 */
export class AddRewardCatalogExpiry1815000000000 implements MigrationInterface {
  name = 'AddRewardCatalogExpiry1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE reward_catalog ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      EXCEPTION
        WHEN undefined_table THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        status_type oid;
        has_archived boolean;
        has_expired boolean;
      BEGIN
        SELECT t.oid INTO status_type
          FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid AND t.typtype = 'e'
          JOIN pg_class c ON c.oid = a.attrelid
         WHERE c.relname = 'reward_catalog'
           AND c.relkind = 'r'
           AND a.attname = 'status'
           AND NOT a.attisdropped;

        IF status_type IS NULL THEN
          RETURN;
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM pg_enum e
           WHERE e.enumtypid = status_type AND e.enumlabel = 'ARCHIVED'
        ) INTO has_archived;
        SELECT EXISTS (
          SELECT 1 FROM pg_enum e
           WHERE e.enumtypid = status_type AND e.enumlabel = 'EXPIRED'
        ) INTO has_expired;

        IF has_archived THEN
          UPDATE reward_catalog
             SET status = 'ARCHIVED'
           WHERE status = 'DISCONTINUED';
        END IF;

        IF has_expired THEN
          UPDATE reward_catalog
             SET status = 'EXPIRED'
           WHERE status = 'ACTIVE'
             AND expires_at IS NOT NULL
             AND expires_at <= NOW();
        END IF;

        IF NOT has_archived THEN
          EXECUTE format(
            'ALTER TYPE %s ADD VALUE IF NOT EXISTS %L',
            status_type::regtype,
            'ARCHIVED'
          );
        END IF;

        IF NOT has_expired THEN
          EXECUTE format(
            'ALTER TYPE %s ADD VALUE IF NOT EXISTS %L',
            status_type::regtype,
            'EXPIRED'
          );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE reward_catalog DROP COLUMN IF EXISTS expires_at;
      EXCEPTION
        WHEN undefined_table THEN NULL;
      END $$;
    `);
  }
}
