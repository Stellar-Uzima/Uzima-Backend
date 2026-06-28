import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchIndexes implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_EMAIL_TRIGRAM"
      ON "users" USING gin (email gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_FIRST_NAME_TRIGRAM"
      ON "users" USING gin (first_name gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_LAST_NAME_TRIGRAM"
      ON "users" USING gin (last_name gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_FULL_NAME_TRIGRAM"
      ON "users" USING gin (full_name gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_TASK_TITLE_TRIGRAM"
      ON "health_tasks" USING gin (title gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_TASK_DESCRIPTION_TRIGRAM"
      ON "health_tasks" USING gin (description gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_FULLTEXT_SEARCH"
      ON "users" USING gin(
        to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(full_name, '') || ' ' || coalesce(email, ''))
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_TASK_FULLTEXT_SEARCH"
      ON "health_tasks" USING gin(
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TASK_FULLTEXT_SEARCH";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USER_FULLTEXT_SEARCH";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TASK_DESCRIPTION_TRIGRAM";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TASK_TITLE_TRIGRAM";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USER_FULL_NAME_TRIGRAM";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USER_LAST_NAME_TRIGRAM";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USER_FIRST_NAME_TRIGRAM";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USER_EMAIL_TRIGRAM";`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm;`);
  }
}
