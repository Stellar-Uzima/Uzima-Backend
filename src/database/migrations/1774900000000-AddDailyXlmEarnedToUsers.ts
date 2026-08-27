import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDailyXlmEarnedToUsers1774900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'dailyXlmEarned',
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'dailyXlmEarned');
  }
}
