import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateHealerAvailabilityAndAppointments1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'availability_slots',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'healer_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'day_of_week',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'start_time',
            type: 'time',
            isNullable: false,
          },
          {
            name: 'end_time',
            type: 'time',
            isNullable: false,
          },
          {
            name: 'is_recurring',
            type: 'boolean',
            default: true,
          },
          {
            name: 'exception_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'is_blocked',
            type: 'boolean',
            default: false,
          },
          {
            name: 'block_reason',
            type: 'text',
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

    await queryRunner.createTable(
      new Table({
        name: 'appointments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'slot_id',
            type: 'uuid',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'healer_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: 'pending',
          },
          {
            name: 'scheduled_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'duration_minutes',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: true,
          },
          {
            name: 'cancellation_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_late_cancellation',
            type: 'boolean',
            default: false,
          },
          {
            name: 'cancellation_notes',
            type: 'text',
            isNullable: true,
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
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('appointments');
    await queryRunner.dropTable('availability_slots');
  }
}
