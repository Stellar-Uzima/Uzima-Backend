import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateStreaksTable1740500000000 implements MigrationInterface {
  name = 'CreateStreaksTable1740500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'streaks',
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
            isUnique: true,
          },
          {
            name: 'currentStreak',
            type: 'int',
            default: 0,
          },
          {
            name: 'longestStreak',
            type: 'int',
            default: 0,
          },
          {
            name: 'lastCompletedDate',
            type: 'date',
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

    await queryRunner.createForeignKey(
      'streaks',
      new TableForeignKey({
        name: 'fk_streaks_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('streaks', 'fk_streaks_user');
    await queryRunner.dropTable('streaks');
  }
}
