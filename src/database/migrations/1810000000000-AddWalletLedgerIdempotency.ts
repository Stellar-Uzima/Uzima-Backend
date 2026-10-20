import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Append-only wallet ledger plus scoped idempotency key storage.
 *
 * `wallet_ledger_entries` holds one insert-only row per credit or debit with a
 * unique id, type, amount and timestamp. `wallet_idempotency_keys` lets wallet
 * operations claim a (user, endpoint, key) triple atomically and replay the
 * stored response on client retries.
 */
export class AddWalletLedgerIdempotency1810000000000
  implements MigrationInterface
{
  name = 'AddWalletLedgerIdempotency1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_ledger_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "direction" varchar(6) NOT NULL
          CHECK ("direction" IN ('credit', 'debit')),
        "amount" decimal(18,7) NOT NULL CHECK ("amount" > 0),
        "type" varchar(32) NOT NULL,
        "referenceType" varchar(50) NULL,
        "referenceId" uuid NULL,
        "balanceAfter" decimal(18,7) NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_wallet_ledger_entries_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_ledger_entries_userId"
         ON "wallet_ledger_entries" ("userId");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_ledger_entries_createdAt"
         ON "wallet_ledger_entries" ("createdAt");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_ledger_entries_reference"
         ON "wallet_ledger_entries" ("referenceType", "referenceId");`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_idempotency_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "endpoint" varchar(64) NOT NULL,
        "userId" uuid NOT NULL,
        "idempotencyKey" varchar(255) NOT NULL,
        "requestId" varchar(64) NULL,
        "requestSnapshot" jsonb NULL,
        "responseSnapshot" jsonb NULL,
        "transactionId" uuid NULL,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_wallet_idempotency_keys_scope"
          UNIQUE ("userId", "endpoint", "idempotencyKey"),
        CONSTRAINT "FK_wallet_idempotency_keys_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wallet_idempotency_keys_transactionId"
         ON "wallet_idempotency_keys" ("transactionId");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_idempotency_keys";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_ledger_entries";`);
  }
}
