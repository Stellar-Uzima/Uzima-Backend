import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCouponsTableForMilestoneRewards1739990403000
  implements MigrationInterface
{
  name = 'UpdateCouponsTableForMilestoneRewards1739990403000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns (one at a time for compatibility)
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "discount" integer NOT NULL DEFAULT 10`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "specialistType" varchar NULL`,
    );

    // Drop xlmValue if it exists (from previous schema)
    await queryRunner.query(
      `ALTER TABLE "coupons" DROP COLUMN IF EXISTS "xlmValue"`,
    );

    // Ensure expiresAt is NOT NULL for new schema (set default for existing nulls)
    await queryRunner.query(
      `UPDATE "coupons" SET "expiresAt" = "createdAt" + interval '30 days' WHERE "expiresAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ALTER COLUMN "expiresAt" SET NOT NULL`,
    );

    // Truncate existing codes to 8 chars before altering column length
    await queryRunner.query(
      `UPDATE "coupons" SET "code" = UPPER(SUBSTRING("code" FROM 1 FOR 8)) WHERE LENGTH("code") > 8`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ALTER COLUMN "code" TYPE varchar(8)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "coupons" DROP COLUMN IF EXISTS "discount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" DROP COLUMN IF EXISTS "specialistType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "xlmValue" decimal(10,2) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ALTER COLUMN "code" TYPE varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "coupons" ALTER COLUMN "expiresAt" DROP NOT NULL`,
    );
  }
}
