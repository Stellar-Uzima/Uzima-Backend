import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Stores email provider acceptance/delivery callbacks.
 *
 * The unique `(provider, providerEventId)` index is what makes duplicate
 * callbacks idempotent.
 */
export class CreateEmailProviderEvents1814000000000 implements MigrationInterface {
  name = 'CreateEmailProviderEvents1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'email_provider_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'provider', type: 'varchar', length: '50', default: `'email'` },
          { name: 'providerEventId', type: 'varchar', length: '255' },
          { name: 'eventType', type: 'varchar', length: '50' },
          { name: 'providerMessageId', type: 'varchar', length: '255', isNullable: true },
          { name: 'notificationId', type: 'uuid', isNullable: true },
          { name: 'deliveryLogId', type: 'uuid', isNullable: true },
          { name: 'recipient', type: 'varchar', length: '320', isNullable: true },
          { name: 'occurredAt', type: 'timestamp with time zone', isNullable: true },
          { name: 'payload', type: 'jsonb' },
          {
            name: 'receivedAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'email_provider_events',
      new TableIndex({
        name: 'uq_email_provider_events_provider_event',
        columnNames: ['provider', 'providerEventId'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'email_provider_events',
      new TableIndex({
        name: 'idx_email_provider_events_notification',
        columnNames: ['notificationId'],
      })
    );

    await queryRunner.createIndex(
      'email_provider_events',
      new TableIndex({
        name: 'idx_email_provider_events_message',
        columnNames: ['providerMessageId'],
      })
    );

    await queryRunner.createIndex(
      'email_provider_events',
      new TableIndex({
        name: 'idx_email_provider_events_occurred',
        columnNames: ['occurredAt'],
      })
    );

    await queryRunner.createForeignKey(
      'email_provider_events',
      new TableForeignKey({
        name: 'fk_email_provider_events_notification',
        columnNames: ['notificationId'],
        referencedTableName: 'in_app_notifications',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );

    await queryRunner.createForeignKey(
      'email_provider_events',
      new TableForeignKey({
        name: 'fk_email_provider_events_delivery_log',
        columnNames: ['deliveryLogId'],
        referencedTableName: 'notification_delivery_logs',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'email_provider_events',
      'fk_email_provider_events_delivery_log'
    );
    await queryRunner.dropForeignKey(
      'email_provider_events',
      'fk_email_provider_events_notification'
    );
    await queryRunner.dropTable('email_provider_events');
  }
}
