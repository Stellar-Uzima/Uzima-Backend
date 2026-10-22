import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1800200000000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1800200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('idempotency_keys');
    if (tableExists) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(255) NOT NULL,
        "userId" varchar(255) NULL,
        "method" varchar(16) NOT NULL,
        "path" varchar(512) NOT NULL,
        "requestHash" varchar(128) NOT NULL,
        "statusCode" integer NOT NULL DEFAULT 200,
        "responseBody" jsonb NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP NOT NULL
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_idempotency_keys_scope" ON "idempotency_keys" ("userId", "method", "path", "key");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_idempotency_keys_expiresAt" ON "idempotency_keys" ("expiresAt");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_keys";`);
  }
}
