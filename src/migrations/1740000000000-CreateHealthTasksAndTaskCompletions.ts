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

    // task_completions table with FKs to users and health_tasks
    await queryRunner.query(`
      CREATE TABLE "task_completions" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "proofUrl"    character varying,
        "status"      "public"."task_completions_status_enum" NOT NULL DEFAULT 'pending',
        "xlmRewarded" numeric(10,2),
        "completedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId"      uuid,
        "taskId"      integer,
        CONSTRAINT "PK_task_completions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_task_completions_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_completions_task"
          FOREIGN KEY ("taskId") REFERENCES "health_tasks"("id") ON DELETE SET NULL
      )
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
