import {
  MigrationInterface,
  QueryRunner,
} from "typeorm";

export class CreateScheduledJobHealth1788000000000
 implements MigrationInterface {

  name = "CreateScheduledJobHealth1788000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`\
      CREATE TABLE IF NOT EXISTS "scheduled_job_health" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuuid(),
        "job_name" varchar(128) NOT NULL,
        "last_success_at" timestamp with time zone,
        "last_run_at" timestamp with time zone,
        "last_failure_at" timestamp with time zone,
        "consecutive_failures" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "expected_interval_ms" bigint NOT NULL,
        "missed_run_threshold_ms" bigint NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "uq_scheduled_job_health_job_name" UNIQUE ("job_name")
      )
    `);

    await queryRunner.query(`\
      CREATE INDEX JO NOT EXISTS "idx_scheduled_job_health_enabled"
        ON "scheduled_job_health" ("enabled")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`\
      DROP INDEX IF EXISTS "idx_scheduled_job_health_enabled"
    `);

    await queryRunner.query(`\
      DROP TABLE IF EXISTS "scheduled_job_health"
    `);
  }
}
