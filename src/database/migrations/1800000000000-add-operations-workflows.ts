import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddOperationsWorkflows1800000000000 implements MigrationInterface {
  name = 'AddOperationsWorkflows1800000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'webhook_events',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
        { name: 'provider', type: 'varchar', length: '50' },
        { name: 'event_id', type: 'varchar', length: '255' },
        { name: 'event_type', type: 'varchar', length: '255' },
        { name: 'payload', type: 'jsonb' },
        { name: 'status', type: 'varchar', length: '20', default: "'received'" },
        { name: 'attempt_count', type: 'integer', default: 0 },
        { name: 'last_error', type: 'text', isNullable: true },
        { name: 'next_attempt_at', type: 'timestamptz', isNullable: true },
        { name: 'received_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    }), true);
    await queryRunner.createIndex('webhook_events', new TableIndex({ name: 'IDX_webhook_provider_event', columnNames: ['provider', 'event_id'], isUnique: true }));
    await queryRunner.createTable(new Table({
      name: 'support_cases',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid' },
        { name: 'subject', type: 'varchar', length: '160' },
        { name: 'description', type: 'text' },
        { name: 'status', type: 'varchar', length: '30', default: "'open'" },
        { name: 'category', type: 'varchar', length: '80', isNullable: true },
        { name: 'notes', type: 'jsonb', default: "'[]'" },
        { name: 'resolved_at', type: 'timestamptz', isNullable: true },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    }), true);
    await queryRunner.createTable(new Table({
      name: 'backfill_runs',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
        { name: 'job_key', type: 'varchar', length: '255', isUnique: true },
        { name: 'status', type: 'varchar', length: '20', default: "'running'" },
        { name: 'processed_count', type: 'integer', default: 0 },
        { name: 'failed_count', type: 'integer', default: 0 },
        { name: 'error_message', type: 'text', isNullable: true },
        { name: 'started_at', type: 'timestamptz', default: 'now()' },
        { name: 'completed_at', type: 'timestamptz', isNullable: true },
      ],
    }), true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('backfill_runs', true);
    await queryRunner.dropTable('support_cases', true);
    await queryRunner.dropTable('webhook_events', true);
  }
}
