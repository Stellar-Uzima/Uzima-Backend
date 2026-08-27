import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeletedAtToHealthTask1774701005673 implements MigrationInterface {
    name = 'AddDeletedAtToHealthTask1774701005673'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "health_tasks" ADD "deletedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "health_tasks" DROP COLUMN "deletedAt"`);
    }

}
