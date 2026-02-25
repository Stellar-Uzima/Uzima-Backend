import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UpdateRewardTransactionsTable1740600000000
  implements MigrationInterface
{
  name = 'UpdateRewardTransactionsTable1740600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old amount column so we can redefine it accurately based on requirements to precision 10 scale 2
    await queryRunner.dropColumn('reward_transactions', 'amount');

    // Add the accurate `amount` column
    await queryRunner.addColumn(
      'reward_transactions',
      new TableColumn({
        name: 'amount',
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0,
      }),
    );

    // Add `attempts` column for job retries
    await queryRunner.addColumn(
      'reward_transactions',
      new TableColumn({
        name: 'attempts',
        type: 'int',
        default: 0,
      }),
    );

    // Note: status, stellarTxHash, and others are already handled in previous migrations
    // based on our review of reward-transaction.entity.ts existing states.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('reward_transactions', 'attempts');
    await queryRunner.dropColumn('reward_transactions', 'amount');

    // Restore old amount formatting
    await queryRunner.addColumn(
      'reward_transactions',
      new TableColumn({
        name: 'amount',
        type: 'decimal',
        precision: 10,
        scale: 7,
      }),
    );
  }
}
