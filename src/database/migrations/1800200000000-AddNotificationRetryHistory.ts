import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationRetryHistory1800200000000 implements MigrationInterface {
  name = 'AddNotificationRetryHistory1800200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" ADD COLUMN "retryHistory" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    // Older rows may contain provider text with addresses, tokens, or payload fragments.
    await queryRunner.query(`UPDATE "notification_delivery_logs" SET "errorMessage" = 'LEGACY_PROVIDER_ERROR', "escalatedReason" = 'LEGACY_PROVIDER_ERROR' WHERE "errorMessage" IS NOT NULL OR "escalatedReason" IS NOT NULL`);

    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" ADD COLUMN IF NOT EXISTS "providerMessageId" varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" ADD COLUMN IF NOT EXISTS "deliveryStatus" varchar(32) NULL`);
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" ADD COLUMN IF NOT EXISTS "deliveryEventAt" timestamptz NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notification_delivery_logs_providerMessageId" ON "notification_delivery_logs" ("providerMessageId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_delivery_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "notificationId" uuid NULL,
        "providerEventId" varchar(255) NOT NULL,
        "providerMessageId" varchar(255) NULL,
        "eventType" varchar(32) NOT NULL,
        "occurredAt" timestamptz NOT NULL,
        "receivedAt" timestamptz NOT NULL DEFAULT now(),
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "PK_email_delivery_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_email_delivery_events_providerEventId" UNIQUE ("providerEventId")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_email_delivery_events_notificationId" ON "email_delivery_events" ("notificationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_email_delivery_events_providerMessageId" ON "email_delivery_events" ("providerMessageId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_delivery_events_providerMessageId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_delivery_events_notificationId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_delivery_events"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_delivery_logs_providerMessageId"`);
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" DROP COLUMN IF EXISTS "deliveryEventAt"`);
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" DROP COLUMN IF EXISTS "deliveryStatus"`);
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" DROP COLUMN IF EXISTS "providerMessageId"`);
    await queryRunner.query(`ALTER TABLE "notification_delivery_logs" DROP COLUMN "retryHistory"`);
  }
}
