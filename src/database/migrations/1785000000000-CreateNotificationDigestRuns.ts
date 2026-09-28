import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableUnique,
} from 'typeorm';

/**
 * Creates the `notification_digest_runs` table backing the (#1371)
 * notification-digest schedule. The composite unique constraint on
 * `(userId, digestDate)` guarantees a user is summarised at most once per day
 * even if the cron job overlaps or is retried.
 */
export class CreateNotificationDigestRuns1785000000000 implements MigrationInterface {
  name = 'CreateNotificationDigestRuns1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE notification_digest_runs_status_enum AS ENUM (
          'queued',
          'completed',
          'skipped',
          'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'notification_digest_runs',
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
            name: 'digestDate',
            type: 'date',
          },
          {
            name: 'status',
            type: 'notification_digest_runs_status_enum',
            default: `'queued'`,
          },
          {
            name: 'itemsCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'emailTo',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'completedAt',
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
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'notification_digest_runs',
      new TableUnique({
        name: 'UQ_notification_digest_runs_user_digestDate',
        columnNames: ['userId', 'digestDate'],
      }),
    );

    await queryRunner.createIndex(
      'notification_digest_runs',
      new TableIndex({
        name: 'IDX_notification_digest_runs_status_digestDate',
        columnNames: ['status', 'digestDate'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_digest_runs', true);
    await queryRunner.query(`DROP TYPE IF EXISTS notification_digest_runs_status_enum`);
  }
}