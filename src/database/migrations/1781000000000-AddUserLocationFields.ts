import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserLocationFields1781000000000 implements MigrationInterface {
  name = 'AddUserLocationFields1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'address',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'city',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'country',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'postalCode',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'postalCode');
    await queryRunner.dropColumn('users', 'country');
    await queryRunner.dropColumn('users', 'city');
    await queryRunner.dropColumn('users', 'address');
  }
}
