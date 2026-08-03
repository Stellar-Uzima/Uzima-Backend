import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTaskExportRequestsTable1782100000000 implements MigrationInterface {
  name = 'CreateTaskExportRequestsTable1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TYPE \"task_export_requests_status_enum\" AS ENUM('pending', 'processing', 'completed', 'failed', 'expired')"
    );

    await queryRunner.createTable(
      new Table({
        name: 'task_export_requests',
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
            name: 'status',
            type: 'task_export_requests_status_enum',
            default: "'pending'",
          },
          {
            name: 'requestedAt',
            type: 'timestamp',
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'downloadExpiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
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
      true
    );

    await queryRunner.createForeignKey(
      'task_export_requests',
      new TableForeignKey({
        name: 'FK_task_export_requests_userId',
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'task_export_requests',
      new TableIndex({
        name: 'IDX_task_export_requests_userId_requestedAt',
        columnNames: ['userId', 'requestedAt'],
      })
    );

    await queryRunner.createIndex(
      'task_export_requests',
      new TableIndex({
        name: 'IDX_task_export_requests_status',
        columnNames: ['status'],
      })
    );

    await queryRunner.createIndex(
      'task_export_requests',
      new TableIndex({
        name: 'IDX_task_export_requests_downloadExpiresAt',
        columnNames: ['downloadExpiresAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'task_export_requests',
      'IDX_task_export_requests_downloadExpiresAt'
    );
    await queryRunner.dropIndex('task_export_requests', 'IDX_task_export_requests_status');
    await queryRunner.dropIndex(
      'task_export_requests',
      'IDX_task_export_requests_userId_requestedAt'
    );
    await queryRunner.dropForeignKey('task_export_requests', 'FK_task_export_requests_userId');
    await queryRunner.dropTable('task_export_requests');
    await queryRunner.query('DROP TYPE "task_export_requests_status_enum"');
  }
}
