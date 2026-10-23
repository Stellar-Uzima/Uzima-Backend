import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ledger for referral reward settlements.
 *
 * One row per settled referral. `referralId` and `rewardTransactionId` are
 * unique so a referral (and the reward transaction it produced) can never be
 * paid out twice, even under concurrent settlement attempts.
 *
 * A referral may produce at most one reward per configured reward type. The
 * `rewardType` column records which reward type was settled, and the unique
 * constraint on ("referralId", "rewardType") enforces the one-per-type rule
 * at the database level so concurrent workers cannot double-issue.
 *
 * Qualification is recorded via `qualifyingAction`; a settlement row is only
 * inserted after the qualifying event has been verified by the application
 * layer, so the presence of a row implies the rule was satisfied.
 */
export class CreateReferralRewardSettlements1800100000000
  implements MigrationInterface
{
  name = 'CreateReferralRewardSettlements1800100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable(
      'referral_reward_settlements',
    );
    if (tableExists) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "referral_reward_settlements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "referralId" uuid NOT NULL,
        "referrerId" uuid NOT NULL,
        "referredId" uuid NOT NULL,
        "rewardType" varchar(64) NOT NULL DEFAULT 'REFERRAL',
        "qualifyingAction" varchar(64) NOT NULL,
        "amount" decimal(18,7) NOT NULL,
        "currency" varchar(32) NOT NULL DEFAULT 'XLM',
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "rewardTransactionId" uuid NULL,
        "metadata" jsonb NULL,
        "settledAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_referral_reward_settlements_referralId"
          UNIQUE ("referralId"),
        CONSTRAINT "UQ_referral_reward_settlements_referralId_rewardType"
          UNIQUE ("referralId", "rewardType"),
        CONSTRAINT "UQ_referral_reward_settlements_rewardTransactionId"
          UNIQUE ("rewardTransactionId"),
        CONSTRAINT "FK_referral_reward_settlements_referral"
          FOREIGN KEY ("referralId") REFERENCES "referral_records"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_referral_reward_settlements_referrer"
          FOREIGN KEY ("referrerId") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_referral_reward_settlements_referred"
          FOREIGN KEY ("referredId") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_referral_reward_settlements_rewardTransaction"
          FOREIGN KEY ("rewardTransactionId") REFERENCES "reward_transactions"("id")
          ON DELETE SET NULL
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_referral_reward_settlements_referrerId" ON "referral_reward_settlements" ("referrerId");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_referral_reward_settlements_referredId" ON "referral_reward_settlements" ("referredId");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "referral_reward_settlements";`,
    );
  }
}
