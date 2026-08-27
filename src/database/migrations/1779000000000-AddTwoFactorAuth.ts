import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTwoFactorAuth1748000000000 implements MigrationInterface {
  name = 'AddTwoFactorAuth1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'twoFactorEnabled',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'twoFactorSecret',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'failedLoginAttempts',
        type: 'int',
        default: 0,
      }),
      new TableColumn({
        name: 'lockedUntil',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'lockedUntil');
    await queryRunner.dropColumn('users', 'failedLoginAttempts');
    await queryRunner.dropColumn('users', 'twoFactorSecret');
    await queryRunner.dropColumn('users', 'twoFactorEnabled');
  }
}
