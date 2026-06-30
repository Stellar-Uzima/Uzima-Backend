import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class CreateHealerAvailabilityTable1781000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAvailability = await queryRunner.hasTable('healer_availability');
    if (!hasAvailability) {
      await queryRunner.createTable(
        new Table({
          name: 'healer_availability',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'gen_random_uuid()',
            },
            {
              name: 'healerId',
              type: 'uuid',
            },
            {
              name: 'startTime',
              type: 'timestamp',
            },
            {
              name: 'endTime',
              type: 'timestamp',
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
      );

      await queryRunner.query(
        `CREATE INDEX "IDX_healer_availability_healer_start" ON "healer_availability" ("healerId", "startTime")`,
      );
    }

    const consultationTable = await queryRunner.getTable('consultation');
    if (consultationTable && !consultationTable.findColumnByName('healerId')) {
      await queryRunner.addColumn(
        'consultation',
        new TableColumn({
          name: 'healerId',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const consultationTable = await queryRunner.getTable('consultation');
    if (consultationTable?.findColumnByName('healerId')) {
      await queryRunner.dropColumn('consultation', 'healerId');
    }

    if (await queryRunner.hasTable('healer_availability')) {
      await queryRunner.dropTable('healer_availability');
    }
  }
}
