import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationRetryHistory1800200000000 implements MigrationInterface {
  name = 'AddNotificationRetryHistory1800200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" ADD COLUMN "retryHistory" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    // Older rows may contain provider text with addresses, tokens, or payload fragments.
    await queryRunner.query(`UPDATE "notification_delivery_logs" SET "errorMessage" = 'LEGACY_PROVIDER_ERROR', "escalatedReason" = 'LEGACY_PROVIDER_ERROR' WHERE "errorMessage" IS NOT NULL OR "escalatedReason" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" DROP COLUMN "retryHistory"`);
  }
}
