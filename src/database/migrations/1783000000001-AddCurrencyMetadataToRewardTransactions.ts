import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';
import { Currency } from '../../shared/currency/currency.enum';

export class AddCurrencyMetadataToRewardTransactions1783000000001
  implements MigrationInterface
{
  name = 'AddCurrencyMetadataToRewardTransactions1783000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('reward_transactions');
    if (!table) return;

    const currencyEnum = Object.values(Currency).map((c) => `'${c}'`).join(', ');
    const currencyCol = table.findColumnByName('currency');
    if (!currencyCol) {
      await queryRunner.addColumn(
        'reward_transactions',
        new TableColumn({
          name: 'currency',
          type: 'enum',
          enum: Object.values(Currency),
          isNullable: false,
          default: `'${Currency.XLM}'`,
        }),
      );
    }

    const amountCol = table.findColumnByName('amount');
    if (amountCol && (amountCol.precision !== 18 || amountCol.scale !== 7)) {
      await queryRunner.changeColumn(
        'reward_transactions',
        'amount',
        new TableColumn({
          name: 'amount',
          type: 'decimal',
          precision: 18,
          scale: 7,
          isNullable: false,
          default: amountCol.default ?? '0',
        }),
      );
    }

    const amountUsdCol = table.findColumnByName('amountUsd');
    if (!amountUsdCol) {
      await queryRunner.addColumn(
        'reward_transactions',
        new TableColumn({
          name: 'amountUsd',
          type: 'decimal',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    const rateAppliedCol = table.findColumnByName('rateApplied');
    if (!rateAppliedCol) {
      await queryRunner.addColumn(
        'reward_transactions',
        new TableColumn({
          name: 'rateApplied',
          type: 'decimal',
          precision: 18,
          scale: 8,
          isNullable: true,
        }),
      );
    }

    const rateSourceCol = table.findColumnByName('rateSource');
    if (!rateSourceCol) {
      await queryRunner.addColumn(
        'reward_transactions',
        new TableColumn({
          name: 'rateSource',
          type: 'varchar',
          length: '32',
          isNullable: true,
        }),
      );
    }

    const rateFetchedAtCol = table.findColumnByName('rateFetchedAt');
    if (!rateFetchedAtCol) {
      await queryRunner.addColumn(
        'reward_transactions',
        new TableColumn({
          name: 'rateFetchedAt',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }

    const freshTable = await queryRunner.getTable('reward_transactions');
    if (!freshTable) return;

    const currencyIndexName = 'IDX_reward_transactions_currency';
    if (!freshTable.indices.some((i) => i.name === currencyIndexName)) {
      await queryRunner.createIndex(
        'reward_transactions',
        new TableIndex({
          name: currencyIndexName,
          columnNames: ['currency'],
        }),
      );
    }

    const userIdIndexName = 'IDX_reward_transactions_userId';
    if (!freshTable.indices.some((i) => i.name === userIdIndexName)) {
      await queryRunner.createIndex(
        'reward_transactions',
        new TableIndex({
          name: userIdIndexName,
          columnNames: ['userId'],
        }),
      );
    }

    const statusIndexName = 'IDX_reward_transactions_status';
    if (!freshTable.indices.some((i) => i.name === statusIndexName)) {
      await queryRunner.createIndex(
        'reward_transactions',
        new TableIndex({
          name: statusIndexName,
          columnNames: ['status'],
        }),
      );
    }

    void currencyEnum;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('reward_transactions');
    if (!table) return;

    const statusIndexName = 'IDX_reward_transactions_status';
    if (table.indices.some((i) => i.name === statusIndexName)) {
      await queryRunner.dropIndex('reward_transactions', statusIndexName);
    }

    const userIdIndexName = 'IDX_reward_transactions_userId';
    if (table.indices.some((i) => i.name === userIdIndexName)) {
      await queryRunner.dropIndex('reward_transactions', userIdIndexName);
    }

    const currencyIndexName = 'IDX_reward_transactions_currency';
    if (table.indices.some((i) => i.name === currencyIndexName)) {
      await queryRunner.dropIndex('reward_transactions', currencyIndexName);
    }

    const dropIfPresent = async (col: string) => {
      const t = await queryRunner.getTable('reward_transactions');
      if (t && t.findColumnByName(col)) {
        await queryRunner.dropColumn('reward_transactions', col);
      }
    };

    await dropIfPresent('rateFetchedAt');
    await dropIfPresent('rateSource');
    await dropIfPresent('rateApplied');
    await dropIfPresent('amountUsd');
    await dropIfPresent('currency');
  }
}
