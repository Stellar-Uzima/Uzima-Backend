import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHealthProgramEnrollments1814000000000 implements MigrationInterface {
  name = 'CreateHealthProgramEnrollments1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "health_program_enrollments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "programCode" varchar(100) NOT NULL,
        "state" varchar(20) NOT NULL DEFAULT 'pending'
          CHECK ("state" IN ('pending', 'eligible', 'ineligible', 'enrolled', 'withdrawn')),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_health_program_enrollments_user_program"
          UNIQUE ("userId", "programCode")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "health_program_enrollment_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "programCode" varchar(100) NOT NULL,
        "previousState" varchar(20)
          CHECK ("previousState" IS NULL OR "previousState" IN ('pending', 'eligible', 'ineligible', 'enrolled', 'withdrawn')),
        "newState" varchar(20) NOT NULL
          CHECK ("newState" IN ('pending', 'eligible', 'ineligible', 'enrolled', 'withdrawn')),
        "changedBy" uuid NOT NULL,
        "reason" text,
        "changedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_health_program_enrollment_history_user_program_changed"
      ON "health_program_enrollment_history" ("userId", "programCode", "changedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "health_program_enrollment_history"`);
    await queryRunner.query(`DROP TABLE "health_program_enrollments"`);
  }
}
