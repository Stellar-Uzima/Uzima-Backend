import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

/**
 * Introduces the `escalated` delivery state.
 *
 * The delivery pipeline can only retry a channel while a live actor observes
 * the failure. `DeliverySweeperService` is the reliability backstop: it
 * re-queues stale attempts and escalates deliveries that exhausted
 * `MAX_DELIVERY_ATTEMPTS`. Escalated records carry human-readable context so
 * operators can reconcile notifications that could not be delivered.
 */
export class AddDeliveryEscalationToDeliveryLogs1784000000000
  implements MigrationInterface
{
  name = 'AddDeliveryEscalationToDeliveryLogs1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend the shared delivery status enum with the new terminal state.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE delivery_status_enum ADD VALUE IF NOT EXISTS 'escalated';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.addColumns('notification_delivery_logs', [
      new TableColumn({
        name: 'escalatedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'escalatedReason',
        type: 'text',
        isNullable: true,
      }),
    ]);

    await queryRunner.createIndex(
      'notification_delivery_logs',
      new TableIndex({
        name: 'IDX_notification_delivery_logs_status_escalatedAt',
        columnNames: ['status', 'escalatedAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'notification_delivery_logs',
      'IDX_notification_delivery_logs_status_escalatedAt',
    );
    await queryRunner.dropColumns('notification_delivery_logs', [
      'escalatedReason',
      'escalatedAt',
    ]);
  }
}