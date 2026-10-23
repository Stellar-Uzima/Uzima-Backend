import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationTemplateVersions1788000000000
  implements MigrationInterface
{
  name = 'CreateNotificationTemplateVersions1788000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE IF NOT EXISTS "notification_template_versions_status_enum" AS ENUM ('draft', 'active', 'archived')`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_template_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "templateKey" varchar(128) NOT NULL,
        "version" integer NOT NULL,
        "subject" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "defaults" jsonb,
        "effectiveAt" TIMESTAMP NOT NULL,
        "status" "notification_template_versions_status_enum" NOT NULL DEFAULT 'draft',
        "changeNote" text,
        "authorId" varchar(255),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "uQ_notification_template_versions_key_version" UNIQUE ("templateKey", "version"),
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_notification_template_versions_templateKey" ON "notification_template_versions" ("templateKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_template_versions_effectiveAt" ON "notification_template_versions" ("effectiveAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_template_versions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "notification_template_versions_status_enum"`,
    );
  }
}
