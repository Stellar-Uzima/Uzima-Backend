import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const CHANNELS = ['email', 'push', 'sms'] as const;
const CATEGORIES = [
  'task_reminder',
  'streak_alert',
  'badge_award',
  'appointment_reminder',
  'report_ready',
  'reward_alert',
  'system',
  'coupon_expiry',
] as const;

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

    // Add CHECK constraint enforcing valid channels and notification categories
    await queryRunner.query(`
      ALTER TABLE notification_preferences
      ADD CONSTRAINT "CHK_notification_preferences_channelPreferences"
      CHECK (
        "channelPreferences" IS NULL
        OR (
          jsonb_typeof("channelPreferences") = 'object'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_object_keys("channelPreferences") AS k
            WHERE k NOT IN (${CATEGORIES.map((c) => `'${c}'`).join(', ')})
          )
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_each("channelPreferences") AS e(category, channels)
            WHERE jsonb_typeof(e.channels) <> 'object'
               OR EXISTS (
                 SELECT 1 FROM jsonb_object_keys(e.channels) AS ck
                 WHERE ck NOT IN (${CHANNELS.map((c) => `'${c}'`).join(', ')})
               )
               OR EXISTS (
                 SELECT 1 FROM jsonb_each(e.channels) AS ce(channel, enabled)
                 WHERE jsonb_typeof(ce.enabled) <> 'boolean'
               )
          )
        )
      )
    `);

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
    await queryRunner.query(
      `ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS "CHK_notification_preferences_channelPreferences"`,
    );
    await queryRunner.dropColumn('notification_preferences', 'channelPreferences');
  }
}
