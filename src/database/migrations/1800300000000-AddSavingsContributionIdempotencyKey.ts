import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a per-user idempotency key to savings contributions so a retried
 * contribution request cannot be posted twice (#1516).
 */
export class AddSavingsContributionIdempotencyKey1800300000000 implements MigrationInterface {
  name = 'AddSavingsContributionIdempotencyKey1800300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('savings_contributions'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('savings_contributions', 'idempotency_key'))) {
      await queryRunner.query(
        `ALTER TABLE "savings_contributions" ADD COLUMN "idempotency_key" varchar(255) NULL;`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_savings_contributions_user_idempotency_key" ON "savings_contributions" ("user_id", "idempotency_key");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_savings_contributions_user_idempotency_key";`,
    );
    await queryRunner.query(
      `ALTER TABLE "savings_contributions" DROP COLUMN IF EXISTS "idempotency_key";`,
    );
  }
}
