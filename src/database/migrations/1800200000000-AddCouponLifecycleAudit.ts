import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCouponLifecycleAudit1800200000000 implements MigrationInterface {
  name = 'AddCouponLifecycleAudit1800200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "usedAt" timestamp NULL`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_coupons_code_unique" ON "coupons" ("code")`
    );
    await queryRunner.query(
      `ALTER TYPE "audit_logs_resource_type_enum" ADD VALUE IF NOT EXISTS 'COUPON'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_code_unique"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN IF EXISTS "usedAt"`);
    await queryRunner.query(
      `UPDATE "audit_logs" SET "resource_type" = 'SYSTEM' WHERE "resource_type" = 'COUPON'`
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "resource_type" TYPE varchar USING "resource_type"::text`
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_logs_resource_type_enum"`);
    await queryRunner.query(
      `CREATE TYPE "audit_logs_resource_type_enum" AS ENUM ('USER', 'TASK', 'HEALTH_TASK', 'REMINDER', 'REWARD', 'TRANSACTION', 'ADMIN', 'SYSTEM')`
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "resource_type" TYPE "audit_logs_resource_type_enum" USING "resource_type"::"audit_logs_resource_type_enum"`
    );
  }
}
