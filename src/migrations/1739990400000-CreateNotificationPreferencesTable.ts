import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateNotificationPreferencesTable1739990400000 implements MigrationInterface {
  name = 'CreateNotificationPreferencesTable1739990400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notification_preferences table
    await queryRunner.createTable(
      new Table({
        name: 'notification_preferences',
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
            isUnique: true,
          },
          {
            name: 'taskReminders',
            type: 'boolean',
            default: true,
          },
          {
            name: 'rewardAlerts',
            type: 'boolean',
            default: true,
          },
          {
            name: 'streakAlerts',
            type: 'boolean',
            default: true,
          },
          {
            name: 'quietHoursStart',
            type: 'varchar',
            length: '5',
            isNullable: true,
          },
          {
            name: 'quietHoursEnd',
            type: 'varchar',
            length: '5',
            isNullable: true,
          },
          {
            name: 'timezone',
            type: 'varchar',
            length: '50',
            default: "'Africa/Lagos'",
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

    // Add foreign key to users table
    await queryRunner.createForeignKey(
      'notification_preferences',
      new TableForeignKey({
        name: 'fk_notification_preferences_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key first
    await queryRunner.dropForeignKey(
      'notification_preferences',
      'fk_notification_preferences_user',
    );

    // Drop the table
    await queryRunner.dropTable('notification_preferences');
  }
}
