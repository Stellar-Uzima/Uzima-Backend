import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddChannelSpecificNotificationPreferences1784000000000
  implements MigrationInterface
{
  name = 'AddChannelSpecificNotificationPreferences1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add JSONB column for granular channel-specific preferences
    await queryRunner.addColumn(
      'notification_preferences',
      new TableColumn({
        name: 'channelPreferences',
        type: 'jsonb',
        default: '{}',
        isNullable: true,
      }),
    );

    // Set default channel preferences for existing records
    await queryRunner.query(`
      UPDATE notification_preferences 
      SET channelPreferences = jsonb_build_object(
        'task_reminder', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", true)
        ),
        'streak_alert', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", true)
        ),
        'badge_award', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", false)
        ),
        'appointment_reminder', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", true)
        ),
        'report_ready', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", false)
        ),
        'reward_alert', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", true)
        ),
        'system', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", false)
        ),
        'coupon_expiry', jsonb_build_object(
          'email', COALESCE("emailNotifications", true),
          'push', COALESCE("pushNotifications", true),
          'sms', COALESCE("smsNotifications", false)
        )
      )
      WHERE channelPreferences IS NULL OR channelPreferences = '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('notification_preferences', 'channelPreferences');
  }
}
