// src/migrations/1700000000000-CreateDailyTaskAssignments.ts
import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableUnique } from 'typeorm';

export class CreateDailyTaskAssignments1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Main assignments table
    await queryRunner.createTable(new Table({
      name: 'daily_task_assignments',
      columns: [
        { name: 'id',           type: 'uuid',        isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
        { name: 'userId',       type: 'uuid',        isNullable: false },
        { name: 'assignedDate', type: 'date',        isNullable: false },
        { name: 'createdAt',    type: 'timestamptz', default: 'now()' },
      ],
    }), true);

    // Unique constraint: one assignment per user per day
    await queryRunner.createUniqueConstraint('daily_task_assignments', new TableUnique({
      name: 'UQ_assignment_user_date',
      columnNames: ['userId', 'assignedDate'],
    }));

    // Junction table for ManyToMany
    await queryRunner.createTable(new Table({
      name: 'daily_task_assignment_tasks',
      columns: [
        { name: 'assignment_id', type: 'uuid' },
        { name: 'task_id',       type: 'uuid' },
      ],
    }), true);

    // Foreign keys
    await queryRunner.createForeignKey('daily_task_assignments', new TableForeignKey({
      columnNames: ['userId'],
      referencedTableName: 'users',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    }));

    await queryRunner.createForeignKey('daily_task_assignment_tasks', new TableForeignKey({
      columnNames: ['assignment_id'],
      referencedTableName: 'daily_task_assignments',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    }));

    await queryRunner.createForeignKey('daily_task_assignment_tasks', new TableForeignKey({
      columnNames: ['task_id'],
      referencedTableName: 'health_tasks',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('daily_task_assignment_tasks', true);
    await queryRunner.dropTable('daily_task_assignments', true);
  }
}