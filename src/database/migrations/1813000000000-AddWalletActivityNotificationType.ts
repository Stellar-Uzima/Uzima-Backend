import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `wallet_activity` notification type (#1534) used for confirmed
 * top-ups, withdrawals, transfers, and savings contributions.
 *
 * Guarded with `to_regtype` so the migration is a no-op on databases where the
 * enum does not exist, and with `IF NOT EXISTS` so it is safe to re-run.
 */
export class AddWalletActivityNotificationType1813000000000
  implements MigrationInterface
{
  name = 'AddWalletActivityNotificationType1813000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regtype('notification_type_enum') IS NOT NULL THEN
          ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'wallet_activity';
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF to_regtype('notification_type_enum') IS NOT NULL THEN
          ALTER TYPE notification_type_enum DROP VALUE IF EXISTS 'wallet_activity';
        END IF;
      EXCEPTION
        WHEN dependent_objects_still_exist THEN NULL;
      END $$;
    `);
  }
}
