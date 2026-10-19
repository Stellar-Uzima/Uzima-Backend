import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reward points subdomain schema: admin-managed point rules, an append-only
 * points ledger with a unique (userId, eventRef) index for idempotent
 * awards/spends, and a points-redemption claim table. Default rules are
 * seeded idempotently.
 */
export class AddRewardPointsLedgerRules1814000000000
  implements MigrationInterface
{
  name = 'AddRewardPointsLedgerRules1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rulesTable: Array<{ t: string | null }> = await queryRunner.query(
      `SELECT to_regclass('reward_point_rules') AS t;`,
    );
    if (!rulesTable?.[0]?.t) {
      await queryRunner.query(`
        CREATE TABLE "reward_point_rules" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "action" varchar(64) NOT NULL,
          "points" integer NOT NULL,
          "active" boolean NOT NULL DEFAULT true,
          "description" text NULL,
          "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_reward_point_rules_action" UNIQUE ("action"),
          CONSTRAINT "CHK_reward_point_rules_points_non_negative" CHECK ("points" >= 0)
        );
      `);

      await queryRunner.query(`
        INSERT INTO "reward_point_rules" ("action", "points", "active", "description")
        VALUES
          ('task.completed', 10, true, 'Awarded once per completed health task event'),
          ('streak.milestone', 25, true, 'Awarded when a daily activity streak milestone is reached'),
          ('referral.signup', 50, true, 'Awarded when a referred user completes signup'),
          ('report.uploaded', 15, true, 'Awarded when a user uploads a report')
        ON CONFLICT ("action") DO NOTHING;
      `);
    }

    const ledgerTable: Array<{ t: string | null }> = await queryRunner.query(
      `SELECT to_regclass('reward_points_ledger') AS t;`,
    );
    if (!ledgerTable?.[0]?.t) {
      await queryRunner.query(`
        CREATE TABLE "reward_points_ledger" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" uuid NOT NULL,
          "delta" integer NOT NULL,
          "balanceAfter" integer NOT NULL,
          "action" varchar(64) NOT NULL,
          "eventRef" varchar(128) NOT NULL,
          "reason" text NULL,
          "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
          CONSTRAINT "FK_reward_points_ledger_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE
        );
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_reward_points_ledger_userId_eventRef"
          ON "reward_points_ledger" ("userId", "eventRef");
      `);
      await queryRunner.query(`
        CREATE INDEX "IDX_reward_points_ledger_userId"
          ON "reward_points_ledger" ("userId");
      `);
    }

    const redemptionsTable: Array<{ t: string | null }> =
      await queryRunner.query(
        `SELECT to_regclass('reward_point_redemptions') AS t;`,
      );
    if (!redemptionsTable?.[0]?.t) {
      await queryRunner.query(`
        CREATE TABLE "reward_point_redemptions" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" uuid NOT NULL,
          "catalogItemId" uuid NOT NULL,
          "pointsSpent" integer NOT NULL,
          "status" varchar(32) NOT NULL DEFAULT 'COMPLETED',
          "createdAt" TIMESTAMP(6) NOT NULL DEFAULT now(),
          CONSTRAINT "FK_reward_point_redemptions_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE
        );
      `);
      await queryRunner.query(`
        CREATE INDEX "IDX_reward_point_redemptions_userId"
          ON "reward_point_redemptions" ("userId");
      `);
      await queryRunner.query(`
        DO $$
        BEGIN
          IF to_regclass('reward_catalog') IS NOT NULL THEN
            ALTER TABLE "reward_point_redemptions"
              ADD CONSTRAINT "FK_reward_point_redemptions_catalog"
              FOREIGN KEY ("catalogItemId") REFERENCES "reward_catalog"("id")
              ON DELETE CASCADE;
          END IF;
        END
        $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "reward_point_redemptions";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_points_ledger";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_point_rules";`);
  }
}
