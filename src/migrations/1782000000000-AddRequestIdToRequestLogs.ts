import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRequestIdToRequestLogs1782000000000 implements MigrationInterface {
  name = 'AddRequestIdToRequestLogs1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'request_logs',
      new TableColumn({
        name: 'requestId',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('request_logs', 'requestId');
  }
}
