import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEmailVerificationFieldsToUsers1737672000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'emailVerificationToken',
        type: 'uuid',
        isNullable: true,
        isUnique: true,
      }),
      new TableColumn({
        name: 'emailVerificationExpiry',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'emailVerificationExpiry');
    await queryRunner.dropColumn('users', 'emailVerificationToken');
  }
}
