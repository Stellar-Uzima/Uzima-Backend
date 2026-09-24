import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Creates the durable store for UX-degradation events (#1377).
 */
export class CreateUxDegradationEvents1787000000000 implements MigrationInterface {
  name = 'CreateUxDegradationEvents1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ux_degradation_events_metric_enum AS ENUM (
          'latency_p95',
          'error_rate',
          'consecutive_5xx'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE ux_degradation_events_status_enum AS ENUM (
          'active',
          'resolved'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'ux_degradation_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'method',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'route',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'metric',
            type: 'ux_degradation_events_metric_enum',
          },
          {
            name: 'threshold',
            type: 'float',
          },
          {
            name: 'observedValue',
            type: 'float',
          },
          {
            name: 'sampleCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'status',
            type: 'ux_degradation_events_status_enum',
            default: `'active'`,
          },
          {
            name: 'detectedAt',
            type: 'timestamp',
          },
          {
            name: 'resolvedAt',
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
      true,
    );

    await queryRunner.createIndex(
      'ux_degradation_events',
      new TableIndex({
        name: 'IDX_ux_degradation_events_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'ux_degradation_events',
      new TableIndex({
        name: 'IDX_ux_degradation_events_route_metric',
        columnNames: ['route', 'metric'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ux_degradation_events', true);
    await queryRunner.query(`DROP TYPE IF EXISTS ux_degradation_events_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS ux_degradation_events_metric_enum`);
  }
}