import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wallet transaction reversal workflow columns and status lifecycle values.
 *
 * Adds the COMPLETED and REVERSED statuses (when the column is a Postgres
 * enum) plus the reversal bookkeeping columns: `originalTransactionId`
 * points a compensating entry at the transaction it reverses (unique, so a
 * transaction can be reversed at most once at the DB level) and
 * `reversedById` records which admin initiated the reversal on the original
 * row. Every step is guarded so the migration is a no-op when
 * `wallet_transactions` does not exist yet (it is created by synchronize in
 * some environments).
 */
export class AddWalletTransactionReversalColumns1811000000000
  implements MigrationInterface
{
  name = 'AddWalletTransactionReversalColumns1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('wallet_transactions');
    if (!tableExists) {
      return;
    }

    // Extend the status enum when (and only when) it is a real PG enum type.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'wallet_transactions_status_enum'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TYPE wallet_transactions_status_enum ADD VALUE IF NOT EXISTS 'COMPLETED';
          ALTER TYPE wallet_transactions_status_enum ADD VALUE IF NOT EXISTS 'REVERSED';
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
        ADD COLUMN IF NOT EXISTS "original_transaction_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "reversed_by_id" uuid NULL;
    `);

    // One compensating entry per original transaction => at most one reversal.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wallet_transactions_original_transaction_id"
        ON "wallet_transactions" ("original_transaction_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_reversed_by_id"
        ON "wallet_transactions" ("reversed_by_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('wallet_transactions');
    if (!tableExists) {
      return;
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_wallet_transactions_reversed_by_id";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_wallet_transactions_original_transaction_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
        DROP COLUMN IF EXISTS "reversed_by_id",
        DROP COLUMN IF EXISTS "original_transaction_id";
    `);
    // Note: Postgres does not support dropping individual enum values;
    // 'COMPLETED'/'REVERSED' remain in wallet_transactions_status_enum.
  }
}
