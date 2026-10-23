import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRetentionTables1800300000000 implements MigrationInterface {
  name = 'CreateRetentionTables1800300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retention_legal_holds" (
        "id" SERIAL PRIMARY KEY,
        "data_class" varchar(100) NOT NULL,
        "record_id" varchar(255) NOT NULL,
        "reason" text NOT NULL,
        "created_by" varchar(255),
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "released_at" timestamp with time zone
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retention_legal_holds_active_record"
      ON "retention_legal_holds" ("data_class", "record_id")
      WHERE "released_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retention_job_runs" (
        "id" SERIAL PRIMARY KEY,
        "job_name" varchar(100) NOT NULL,
        "status" varchar(20) NOT NULL,
        "started_at" timestamp with time zone NOT NULL DEFAULT now(),
        "completed_at" timestamp with time zone,
        "deleted_counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "error_message" text,
        "updated_at" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "retention_job_runs"');
    await queryRunner.query('DROP TABLE IF EXISTS "retention_legal_holds"');
  }
}
