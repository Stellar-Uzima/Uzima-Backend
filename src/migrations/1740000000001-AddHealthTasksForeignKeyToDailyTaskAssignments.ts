import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class AddHealthTasksForeignKeyToDailyTaskAssignments1740000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add foreign key constraint to link task_id to health_tasks.id
    await queryRunner.createForeignKey(
      'daily_task_assignment_tasks',
      new TableForeignKey({
        columnNames: ['task_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'health_tasks',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint
    const table = await queryRunner.getTable('daily_task_assignment_tasks');
    const foreignKey = table.foreignKeys.find(
      fk => fk.columnNames.indexOf('task_id') !== -1
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey(
        'daily_task_assignment_tasks',
        foreignKey
      );
    }
  }
}