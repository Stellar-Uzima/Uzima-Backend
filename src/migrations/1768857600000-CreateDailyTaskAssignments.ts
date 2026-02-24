import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateDailyTaskAssignments1768857600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.createTable(
      new Table({
        name: 'daily_task_assignments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'assigned_date',
            type: 'date',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'daily_task_assignments',
      new TableUnique({
        name: 'UQ_daily_task_assignments_user_id_assigned_date',
        columnNames: ['user_id', 'assigned_date'],
      }),
    );

    await queryRunner.createIndex(
      'daily_task_assignments',
      new TableIndex({
        name: 'IDX_daily_task_assignments_user_id_assigned_date',
        columnNames: ['user_id', 'assigned_date'],
      }),
    );

    await queryRunner.createForeignKey(
      'daily_task_assignments',
      new TableForeignKey({
        name: 'FK_daily_task_assignments_user_id',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'daily_task_assignment_tasks',
        columns: [
          {
            name: 'daily_task_assignment_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'health_task_id',
            type: 'uuid',
            isPrimary: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'daily_task_assignment_tasks',
      new TableIndex({
        name: 'IDX_daily_task_assignment_tasks_assignment_id',
        columnNames: ['daily_task_assignment_id'],
      }),
    );

    await queryRunner.createIndex(
      'daily_task_assignment_tasks',
      new TableIndex({
        name: 'IDX_daily_task_assignment_tasks_health_task_id',
        columnNames: ['health_task_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'daily_task_assignment_tasks',
      new TableForeignKey({
        name: 'FK_daily_task_assignment_tasks_assignment_id',
        columnNames: ['daily_task_assignment_id'],
        referencedTableName: 'daily_task_assignments',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'daily_task_assignment_tasks',
      new TableForeignKey({
        name: 'FK_daily_task_assignment_tasks_health_task_id',
        columnNames: ['health_task_id'],
        referencedTableName: 'health_tasks',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const assignmentTasksTable = await queryRunner.getTable(
      'daily_task_assignment_tasks',
    );

    if (assignmentTasksTable) {
      const assignmentFk = assignmentTasksTable.foreignKeys.find(
        (fk) => fk.name === 'FK_daily_task_assignment_tasks_assignment_id',
      );
      if (assignmentFk) {
        await queryRunner.dropForeignKey(
          'daily_task_assignment_tasks',
          assignmentFk,
        );
      }

      const healthTaskFk = assignmentTasksTable.foreignKeys.find(
        (fk) => fk.name === 'FK_daily_task_assignment_tasks_health_task_id',
      );
      if (healthTaskFk) {
        await queryRunner.dropForeignKey(
          'daily_task_assignment_tasks',
          healthTaskFk,
        );
      }
    }

    await queryRunner.dropTable('daily_task_assignment_tasks', true);

    const assignmentTable = await queryRunner.getTable(
      'daily_task_assignments',
    );
    if (assignmentTable) {
      const userFk = assignmentTable.foreignKeys.find(
        (fk) => fk.name === 'FK_daily_task_assignments_user_id',
      );
      if (userFk) {
        await queryRunner.dropForeignKey('daily_task_assignments', userFk);
      }
    }

    await queryRunner.dropIndex(
      'daily_task_assignments',
      'IDX_daily_task_assignments_user_id_assigned_date',
    );

    await queryRunner.dropUniqueConstraint(
      'daily_task_assignments',
      'UQ_daily_task_assignments_user_id_assigned_date',
    );

    await queryRunner.dropTable('daily_task_assignments', true);
  }
}
