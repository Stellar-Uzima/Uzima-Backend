import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRejectionReasonToTaskCompletions1772000000000
  implements MigrationInterface
{
  name = 'AddRejectionReasonToTaskCompletions1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "task_completions"
      ADD COLUMN "rejection_reason" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "task_completions"
      DROP COLUMN "rejection_reason"
    `);
  }
}
