import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferralRiskReviews1800200000000
  implements MigrationInterface
{
  name = 'CreateReferralRiskReviews1800200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('referral_risk_reviews')) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "referral_risk_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "referralId" uuid NOT NULL,
        "referrerId" uuid NOT NULL,
        "referredId" uuid NOT NULL,
        "reasonCode" varchar(64) NOT NULL,
        "reasonCodes" jsonb NOT NULL,
        "signalDetails" jsonb NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "qualifyingAction" varchar(64) NOT NULL,
        "amount" decimal(18,7) NOT NULL,
        "currency" varchar(32) NOT NULL DEFAULT 'XLM',
        "referenceId" varchar(128) NULL,
        "reviewedBy" uuid NULL,
        "reviewNote" varchar(1000) NULL,
        "reviewedAt" TIMESTAMP NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_referral_risk_reviews_referralId" UNIQUE ("referralId"),
        CONSTRAINT "FK_referral_risk_reviews_referral"
          FOREIGN KEY ("referralId") REFERENCES "referral_records"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_referral_risk_reviews_referrer"
          FOREIGN KEY ("referrerId") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_referral_risk_reviews_referred"
          FOREIGN KEY ("referredId") REFERENCES "users"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_referral_risk_reviews_reviewer"
          FOREIGN KEY ("reviewedBy") REFERENCES "users"("id")
          ON DELETE SET NULL
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_referral_risk_reviews_status_createdAt" ON "referral_risk_reviews" ("status", "createdAt");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "referral_risk_reviews";');
  }
}
