import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutboxEvents1800200000000 implements MigrationInterface {
  name = 'CreateOutboxEvents1800200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "outbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventType" varchar(255) NOT NULL,
        "aggregateType" varchar(128) NOT NULL,
        "aggregateId" varchar(255) NOT NULL,
        "payload" jsonb NOT NULL,
        "idempotencyKey" varchar(255),
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "availableAt" timestamp NOT NULL DEFAULT now(),
        "publishedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT PK_outbox_events_primary PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_outbox_events_status_availableAt" ON "outbox_events" ("status", "availableAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_outbox_events_aggregate" ON "outbox_events" ("aggregateType", "aggregateId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uqg_outbox_events_idempotencyKey" ON "outbox_events" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "email_delivery_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "notificationId" varchar(255) NOT NULL,
        "providerName" varchar(64) NOT NULL,
        "providerMessageId" varchar(255) NOT NULL,
        "eventType" varchar(64) NOT NULL,
        "providerEventId" varchar(255) NOT NULL,
        "occurredAt" timestamp NOT NULL,
        "rawPayload" jsonb NOT NULL,
        "receivedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT PK_email_delivery_events_primary PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uqg_email_delivery_events_provider_event" ON "email_delivery_events" ("providerName", "providerEventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_email_delivery_events_notification" ON "email_delivery_events" ("notificationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_email_delivery_events_providerMessageId" ON "email_delivery_events" ("providerName", "providerMessageId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_delivery_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_events"`);
  }
}
