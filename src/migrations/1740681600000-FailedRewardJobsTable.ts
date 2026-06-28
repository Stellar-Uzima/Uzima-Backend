import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class FailedRewardJobsTable1740681600000 implements MigrationInterface {
  name = 'FailedRewardJobsTable1740681600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('failed_reward_jobs');

    if (tableExists) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'failed_reward_jobs',
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
            name: 'xlmAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'taskCompletionId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
          },
          {
            name: 'jobId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'attemptsMade',
            type: 'int',
            default: 0,
          },
          {
            name: 'jobType',
            type: 'varchar',
            length: '50',
            default: "'reward-distribution'",
          },
          {
            name: 'jobData',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'failedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
    );

    // Foreign key to users table
    await queryRunner.createForeignKey(
      'failed_reward_jobs',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('failed_reward_jobs', true);
  }
}
