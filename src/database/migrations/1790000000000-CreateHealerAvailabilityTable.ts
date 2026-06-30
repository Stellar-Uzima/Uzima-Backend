import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateHealerAvailabilityTable1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: 'healer_availability',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'healer_id', type: 'uuid', isNullable: false },
          { name: 'start_time', type: 'timestamptz', isNullable: false },
          { name: 'end_time', type: 'timestamptz', isNullable: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'healer_availability',
      new TableIndex({ name: 'IDX_HEALER_AVAILABILITY_HEALER', columnNames: ['healer_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('healer_availability', 'IDX_HEALER_AVAILABILITY_HEALER');
    await queryRunner.dropTable('healer_availability', true);
  }
}
