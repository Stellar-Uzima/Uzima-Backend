import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateGamificationTables1743200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_xp table
    await queryRunner.createTable(
      new Table({
        name: 'user_xp',
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
            isNullable: false,
          },
          {
            name: 'totalXp',
            type: 'int',
            default: 0,
          },
          {
            name: 'currentLevel',
            type: 'int',
            default: 0,
          },
          {
            name: 'xpTowardNextLevel',
            type: 'int',
            default: 0,
          },
          {
            name: 'xpForNextLevel',
            type: 'int',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create xp_transactions table
    await queryRunner.createTable(
      new Table({
        name: 'xp_transactions',
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
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'sourceEvent',
            type: 'enum',
            enum: ['task_completed', 'streak_day', 'badge_earned', 'first_completion_of_category', 'achievement_unlocked'],
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create achievements table
    await queryRunner.createTable(
      new Table({
        name: 'achievements',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'key',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'unlockCondition',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'xpReward',
            type: 'int',
            default: 50,
          },
          {
            name: 'icon',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create user_achievements table
    await queryRunner.createTable(
      new Table({
        name: 'user_achievements',
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
            isNullable: false,
          },
          {
            name: 'achievementId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'unlockedAt',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'user_xp',
      new TableIndex({
        name: 'IDX_USER_XP_USER_ID',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'xp_transactions',
      new TableIndex({
        name: 'IDX_XP_TRANSACTIONS_USER_ID',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'xp_transactions',
      new TableIndex({
        name: 'IDX_XP_TRANSACTIONS_USER_CREATED',
        columnNames: ['userId', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'user_achievements',
      new TableIndex({
        name: 'IDX_USER_ACHIEVEMENTS_USER_ACHIEVEMENT',
        columnNames: ['userId', 'achievementId'],
        isUnique: true,
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'user_xp',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'xp_transactions',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_achievements',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_achievements',
      new TableForeignKey({
        columnNames: ['achievementId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'achievements',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_achievements');
    await queryRunner.dropTable('achievements');
    await queryRunner.dropTable('xp_transactions');
    await queryRunner.dropTable('user_xp');
  }
}
