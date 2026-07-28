import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddNotificationChannelsToPreferences1774800000000
  implements MigrationInterface
{
  name = 'AddNotificationChannelsToPreferences1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add emailNotifications column
    await queryRunner.addColumn(
      'notification_preferences',
      new TableColumn({
        name: 'emailNotifications',
        type: 'boolean',
        default: true,
      }),
    );

    // Add smsNotifications column
    await queryRunner.addColumn(
      'notification_preferences',
      new TableColumn({
        name: 'smsNotifications',
        type: 'boolean',
        default: true,
      }),
    );

    // Add pushNotifications column
    await queryRunner.addColumn(
      'notification_preferences',
      new TableColumn({
        name: 'pushNotifications',
        type: 'boolean',
        default: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns in reverse order
    await queryRunner.dropColumn('notification_preferences', 'pushNotifications');
    await queryRunner.dropColumn('notification_preferences', 'smsNotifications');
    await queryRunner.dropColumn('notification_preferences', 'emailNotifications');
  }
}
