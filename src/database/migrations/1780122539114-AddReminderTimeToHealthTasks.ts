import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReminderTimeToHealthTasks1780122539114 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'health_tasks',
      new TableColumn({
        name: 'reminderTime',
        type: 'timestamptz',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('health_tasks', 'reminderTime');
  }
}
