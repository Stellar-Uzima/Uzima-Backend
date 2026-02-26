import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTaskCompletionsTable1739990401000 implements MigrationInterface {
  name = 'CreateTaskCompletionsTable1739990401000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create task_completions table
    await queryRunner.createTable(
      new Table({
        name: 'task_completions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'taskId',
            type: 'int',
          },
          {
            name: 'rewardXlm',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Add foreign key to users table
    await queryRunner.createForeignKey(
      'task_completions',
      new TableForeignKey({
        name: 'fk_task_completions_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add index on userId and completedAt for efficient streak calculations
    await queryRunner.createIndex(
      'task_completions',
      new TableIndex({
        name: 'idx_task_completions_user_completed',
        columnNames: ['userId', 'completedAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index first
    await queryRunner.dropIndex(
      'task_completions',
      'idx_task_completions_user_completed',
    );

    // Drop foreign key
    await queryRunner.dropForeignKey(
      'task_completions',
      'fk_task_completions_user',
    );

    // Drop the table
    await queryRunner.dropTable('task_completions');
  }
}
