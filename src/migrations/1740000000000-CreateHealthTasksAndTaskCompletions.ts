import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHealthTasksAndTaskCompletions1740000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // health_tasks table
    await queryRunner.query(`
      CREATE TABLE "health_tasks" (
        "id"         SERIAL NOT NULL,
        "name"       character varying NOT NULL,
        "categoryId" integer NOT NULL,
        "reward"     numeric(10,2) NOT NULL,
        CONSTRAINT "PK_health_tasks" PRIMARY KEY ("id")
      )
    `);

    // completion status enum
    await queryRunner.query(`
      CREATE TYPE "public"."task_completions_status_enum"
        AS ENUM('pending', 'approved', 'rejected')
    `);

    // Add missing columns to existing task_completions table
    await queryRunner.query(`
      ALTER TABLE "task_completions"
      ADD COLUMN IF NOT EXISTS "proofUrl" character varying,
      ADD COLUMN IF NOT EXISTS "status" "public"."task_completions_status_enum" NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "xlmRewarded" numeric(10,2),
      ADD COLUMN IF NOT EXISTS "taskId" integer
    `);

    // Add foreign key constraint to health_tasks
    await queryRunner.query(`
      ALTER TABLE "task_completions"
      ADD CONSTRAINT "FK_task_completions_task"
        FOREIGN KEY ("taskId") REFERENCES "health_tasks"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "task_completions"`);
    await queryRunner.query(
      `DROP TYPE "public"."task_completions_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "health_tasks"`);
  }
}
