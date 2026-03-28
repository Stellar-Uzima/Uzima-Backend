import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class UpdateRewardTransactionsTable1740600000000
  implements MigrationInterface
{
  name = 'UpdateRewardTransactionsTable1740600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('reward_transactions');
    
    if (!tableExists) {
        await queryRunner.createTable(new Table({
            name: 'reward_transactions',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    generationStrategy: 'uuid',
                    default: 'gen_random_uuid()'
                },
                {
                    name: 'userId',
                    type: 'uuid'
                },
                {
                    name: 'amount',
                    type: 'decimal',
                    precision: 10,
                    scale: 2,
                    default: 0
                },
                {
                    name: 'status',
                    type: 'varchar',
                    default: "'PENDING'"
                },
                {
                    name: 'stellarTxHash',
                    type: 'varchar',
                    isNullable: true
                },
                {
                    name: 'attempts',
                    type: 'int',
                    default: 0
                },
                {
                    name: 'taskCompletionId',
                    type: 'uuid',
                    isNullable: true
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    default: 'now()'
                },
                {
                    name: 'updatedAt',
                    type: 'timestamp',
                    default: 'now()'
                }
            ]
        }));

        await queryRunner.createForeignKey('reward_transactions', new TableForeignKey({
            columnNames: ['userId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE'
        }));

        return; // Work is done
    }

    // Original logic for when table already exists
    // Drop the old amount column so we can redefine it accurately based on requirements to precision 10 scale 2
    const table = await queryRunner.getTable('reward_transactions');
    if (table && table.findColumnByName('amount')) {
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
    }

    if (table && !table.findColumnByName('attempts')) {
        // Add `attempts` column for job retries
        await queryRunner.addColumn(
            'reward_transactions',
            new TableColumn({
                name: 'attempts',
                type: 'int',
                default: 0,
            }),
        );
    }
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
