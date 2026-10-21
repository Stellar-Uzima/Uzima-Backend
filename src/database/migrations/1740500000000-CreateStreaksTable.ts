import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
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

    await queryRunner.createTable(
      new Table({
        name: 'streak_milestone_awards',
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
            name: 'milestone',
            type: 'int',
          },
          {
            name: 'rewardId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'streak_milestone_awards',
      new TableForeignKey({
        name: 'fk_streak_milestone_awards_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADER',
      }),
    );

    await queryRunner.createIndex(
      'streak_milestone_awards',
      new TableIndex({
        name: 'idx_streak_milestone_awards_user_milestone',
        columnNames: ['userId', 'milestone'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'streak_milestone_awards',
      'idx_streak_milestone_awards_user_milestone',
    );
    await queryRunner.dropForeignKey(
      'streak_milestone_awards',
      'fk_streak_milestone_awards_user',
    );
    await queryRunner.dropTable('streak_milestone_awards');
    await queryRunner.dropForeignKey('streaks', 'fk_streaks_user');
    await queryRunner.dropTable('streaks');
  }
}
