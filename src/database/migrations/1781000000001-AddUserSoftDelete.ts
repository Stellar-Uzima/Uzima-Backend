import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSoftDelete1781000000000 implements MigrationInterface {
  name = 'AddUserSoftDelete1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
  }
}
