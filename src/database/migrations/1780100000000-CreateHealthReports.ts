import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateHealthReports1780100000000 implements MigrationInterface {
  name = 'CreateHealthReports1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'health_reports',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'periodStart',
            type: 'date',
          },
          {
            name: 'periodEnd',
            type: 'date',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'generating', 'ready', 'failed'],
            default: `'pending'`,
          },
          {
            name: 'storageKey',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'generatedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'health_reports',
      new TableForeignKey({
        name: 'fk_health_reports_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'health_reports',
      new TableIndex({
        name: 'idx_health_reports_user_period',
        columnNames: ['userId', 'periodStart', 'periodEnd'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('health_reports', 'idx_health_reports_user_period');
    await queryRunner.dropForeignKey('health_reports', 'fk_health_reports_user');
    await queryRunner.dropTable('health_reports');
  }
}
