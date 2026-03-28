import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the case-sensitive UNIQUE on users.email with a unique index on
 * LOWER(email), so duplicates differing only by case are rejected at the DB layer.
 */
export class CaseInsensitiveUniqueEmail1772100000000
  implements MigrationInterface
{
  name = 'CaseInsensitiveUniqueEmail1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT c.conname AS name
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE t.relname = 'users'
            AND c.contype = 'u'
            AND cardinality(c.conkey) = 1
            AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = t.oid
                AND a.attnum = c.conkey[1]
                AND a.attname = 'email'
            )
        LOOP
          EXECUTE format('ALTER TABLE "users" DROP CONSTRAINT %I', r.name);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email_lower"
      ON "users" (LOWER("email"))
      WHERE "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE ("email")`,
    );
  }
}
