import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHealthProgramEnrollments1814000000000 implements MigrationInterface {
  name = 'CreateHealthProgramEnrollments1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "health_program_enrollments_status_enum" AS ENUM (
        'pending',
        'ineligible',
        'eligible',
        'enrolled',
        'withdrawn'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "health_program_enrollments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL UNIQUE,
        "status" "health_program_enrollments_status_enum" NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_health_program_enrollments_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "health_program_enrollment_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "fromStatus" "health_program_enrollments_status_enum" NOT NULL,
        "toStatus" "health_program_enrollments_status_enum" NOT NULL,
        "changedById" uuid NULL,
        "reason" varchar(500) NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_health_program_enrollment_history_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_health_program_enrollment_history_actor"
          FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_health_program_enrollment_history_user_created"
        ON "health_program_enrollment_history" ("userId", "createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "health_program_enrollment_history";');
    await queryRunner.query('DROP TABLE IF EXISTS "health_program_enrollments";');
    await queryRunner.query('DROP TYPE IF EXISTS "health_program_enrollments_status_enum";');
  }
}
