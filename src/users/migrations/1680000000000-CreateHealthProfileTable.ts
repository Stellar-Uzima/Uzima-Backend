import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateHealthProfileTable1680000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'health_profiles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'healthGoals', type: 'text', isArray: true, default: 'ARRAY[]::text[]' },
          { name: 'chronicConditions', type: 'text', isNullable: true },
          { name: 'preferredHealerType', type: 'varchar', default: `'BOTH'` },
          { name: 'dailyTaskTarget', type: 'int', default: 3 },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'health_profiles',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('health_profiles');
  }
}