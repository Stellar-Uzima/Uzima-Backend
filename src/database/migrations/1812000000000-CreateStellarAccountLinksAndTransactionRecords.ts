import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stellar account linking (#1527) and transaction status tracking (#1529).
 *
 * `stellar_account_links` enforces uniqueness of the (user_id, public_key)
 * identity pair. `stellar_transaction_records` keys lifecycle rows on the
 * unique network hash so status updates stay idempotent.
 */
export class CreateStellarAccountLinksAndTransactionRecords1812000000000
  implements MigrationInterface
{
  name = 'CreateStellarAccountLinksAndTransactionRecords1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const accountLinksExist = await queryRunner.hasTable('stellar_account_links');
    if (!accountLinksExist) {
      await queryRunner.query(`
        CREATE TABLE "stellar_account_links" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "user_id" uuid NOT NULL,
          "public_key" varchar(56) NOT NULL,
          "network" varchar(16) NOT NULL,
          "status" varchar(16) NOT NULL DEFAULT 'PENDING',
          "verification_tx_hash" varchar(64) NULL,
          "verified_at" TIMESTAMP WITH TIME ZONE NULL,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_stellar_account_links_userId_publicKey"
            UNIQUE ("user_id", "public_key")
        );
      `);
    }

    const recordsExist = await queryRunner.hasTable('stellar_transaction_records');
    if (!recordsExist) {
      await queryRunner.query(`
        CREATE TABLE "stellar_transaction_records" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "hash" varchar(64) NOT NULL,
          "user_id" uuid NULL,
          "type" varchar(16) NOT NULL,
          "status" varchar(16) NOT NULL DEFAULT 'SUBMITTED',
          "ledger_sequence" integer NULL,
          "amount" decimal(18,7) NULL,
          "counterpart_address" varchar(56) NULL,
          "raw_response" jsonb NULL,
          "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "confirmed_at" TIMESTAMP WITH TIME ZONE NULL,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_stellar_transaction_records_hash" UNIQUE ("hash")
        );
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_stellar_transaction_records_user_id" ON "stellar_transaction_records" ("user_id");`
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_stellar_transaction_records_status" ON "stellar_transaction_records" ("status");`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stellar_transaction_records";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stellar_account_links";`);
  }
}
