import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Creates the two tables required by the Notification Center:
 *  - in_app_notifications  — inbox records (always created)
 *  - notification_delivery_logs — per-channel delivery audit trail
 */
export class CreateNotificationCenter1782100000000 implements MigrationInterface {
  name = 'CreateNotificationCenter1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enums ─────────────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE notification_type_enum AS ENUM (
          'task_reminder',
          'streak_alert',
          'badge_award',
          'appointment_reminder',
          'report_ready',
          'reward_alert',
          'system',
          'coupon_expiry'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE delivery_channel_enum AS ENUM (
          'in_app',
          'email',
          'push',
          'sms'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE delivery_status_enum AS ENUM (
          'pending',
          'sent',
          'failed'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ── 2. in_app_notifications ───────────────────────────────────────────────

    await queryRunner.createTable(
      new Table({
        name: 'in_app_notifications',
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
          },
          {
            name: 'type',
            type: 'notification_type_enum',
            default: `'system'`,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'body',
            type: 'text',
          },
          {
            name: 'data',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'deliveredChannels',
            type: 'text',
            // TypeORM simple-array stores as comma-separated text; default = 'in_app'
            default: `'in_app'`,
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
      'in_app_notifications',
      new TableForeignKey({
        name: 'fk_in_app_notifications_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'in_app_notifications',
      new TableIndex({
        name: 'idx_in_app_notifications_user_read',
        columnNames: ['userId', 'readAt'],
      }),
    );

    await queryRunner.createIndex(
      'in_app_notifications',
      new TableIndex({
        name: 'idx_in_app_notifications_user_created',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    // ── 3. notification_delivery_logs ─────────────────────────────────────────

    await queryRunner.createTable(
      new Table({
        name: 'notification_delivery_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'notificationId',
            type: 'uuid',
          },
          {
            name: 'channel',
            type: 'delivery_channel_enum',
          },
          {
            name: 'status',
            type: 'delivery_status_enum',
            default: `'pending'`,
          },
          {
            name: 'attempts',
            type: 'int',
            default: 0,
          },
          {
            name: 'attemptedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
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
      'notification_delivery_logs',
      new TableForeignKey({
        name: 'fk_notification_delivery_logs_notification',
        columnNames: ['notificationId'],
        referencedTableName: 'in_app_notifications',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'notification_delivery_logs',
      new TableIndex({
        name: 'idx_ndl_notification_channel',
        columnNames: ['notificationId', 'channel'],
      }),
    );

    await queryRunner.createIndex(
      'notification_delivery_logs',
      new TableIndex({
        name: 'idx_ndl_status_attempted',
        columnNames: ['status', 'attemptedAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Logs first (FK dependency)
    await queryRunner.dropForeignKey(
      'notification_delivery_logs',
      'fk_notification_delivery_logs_notification',
    );
    await queryRunner.dropTable('notification_delivery_logs');

    await queryRunner.dropForeignKey(
      'in_app_notifications',
      'fk_in_app_notifications_user',
    );
    await queryRunner.dropTable('in_app_notifications');

    await queryRunner.query(`DROP TYPE IF EXISTS delivery_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS delivery_channel_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS notification_type_enum`);
  }
}
