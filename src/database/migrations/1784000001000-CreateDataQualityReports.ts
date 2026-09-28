import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Creates the storage for data-quality validation reports, together with the
 * two enum types used by `DataQualityReport` (`status` and `severity`).
 *
 * Table and enum names follow TypeORM's defaults so the entity can be used
 * with `synchronize` as well as explicit migrations.
 */
export class CreateDataQualityReports1784000001000 implements MigrationInterface {
  name = 'CreateDataQualityReports1784000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum types (idempotent creation). TypeORM default enum type names are
    // `<table>_<column>_enum`.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE data_quality_reports_status_enum AS ENUM (
          'passed',
          'with_anomalies',
          'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE data_quality_reports_severity_enum AS ENUM (
          'info',
          'medium',
          'high',
          'critical'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'data_quality_reports',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'jobName',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'tableName',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'severity',
            type: 'data_quality_reports_severity_enum',
            default: `'info'`,
          },
          {
            name: 'status',
            type: 'data_quality_reports_status_enum',
            default: `'passed'`,
          },
          {
            name: 'checkedCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'anomalyCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'summary',
            type: 'text',
          },
          {
            name: 'anomalies',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'windowStart',
            type: 'timestamp',
          },
          {
            name: 'windowEnd',
            type: 'timestamp',
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
      true,
    );

    await queryRunner.createIndex(
      'data_quality_reports',
      new TableIndex({
        name: 'IDX_data_quality_reports_jobName_windowEnd',
        columnNames: ['jobName', 'windowEnd'],
      }),
    );
    await queryRunner.createIndex(
      'data_quality_reports',
      new TableIndex({
        name: 'IDX_data_quality_reports_severity_status',
        columnNames: ['severity', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('data_quality_reports', true);
    await queryRunner.query(`DROP TYPE IF EXISTS data_quality_reports_severity_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS data_quality_reports_status_enum`);
  }
}