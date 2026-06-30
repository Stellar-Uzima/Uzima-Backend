import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateBadgeTables1701000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create badges table
    await queryRunner.createTable(
      new Table({
        name: 'badges',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: [
              'FIRST_TASK',
              'STREAK_7_DAYS',
              'STREAK_30_DAYS',
              'STREAK_100_DAYS',
              'HEALTH_CHAMPION',
            ],
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'icon',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'milestone',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'milestone_type',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true // ifNotExists
    );

    // Create index on type
    await queryRunner.createIndex(
      'badges',
      new TableIndex({
        name: 'IDX_BADGES_TYPE',
        columnNames: ['type'],
      })
    );

    // Create user_badges table
    await queryRunner.createTable(
      new Table({
        name: 'user_badges',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'badge_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'awarded_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true // ifNotExists
    );

    // Create unique constraint on user_id and badge_id
    await queryRunner.createIndex(
      'user_badges',
      new TableIndex({
        name: 'IDX_USER_BADGES_UNIQUE',
        columnNames: ['user_id', 'badge_id'],
        isUnique: true,
      })
    );

    // Create index on user_id
    await queryRunner.createIndex(
      'user_badges',
      new TableIndex({
        name: 'IDX_USER_BADGES_USER_ID',
        columnNames: ['user_id'],
      })
    );

    // Add foreign key for user_id
    await queryRunner.createForeignKey(
      'user_badges',
      new TableForeignKey({
        name: 'FK_USER_BADGES_USER_ID',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    // Add foreign key for badge_id
    await queryRunner.createForeignKey(
      'user_badges',
      new TableForeignKey({
        name: 'FK_USER_BADGES_BADGE_ID',
        columnNames: ['badge_id'],
        referencedTableName: 'badges',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const table = await queryRunner.getTable('user_badges');
    const userFk = table?.foreignKeys.find((fk) => fk.name === 'FK_USER_BADGES_USER_ID');
    const badgeFk = table?.foreignKeys.find((fk) => fk.name === 'FK_USER_BADGES_BADGE_ID');

    if (userFk) {
      await queryRunner.dropForeignKey('user_badges', userFk);
    }

    if (badgeFk) {
      await queryRunner.dropForeignKey('user_badges', badgeFk);
    }

    // Drop indexes
    await queryRunner.dropIndex('user_badges', 'IDX_USER_BADGES_UNIQUE');
    await queryRunner.dropIndex('user_badges', 'IDX_USER_BADGES_USER_ID');
    await queryRunner.dropIndex('badges', 'IDX_BADGES_TYPE');

    // Drop tables
    await queryRunner.dropTable('user_badges', true);
    await queryRunner.dropTable('badges', true);
  }
}
