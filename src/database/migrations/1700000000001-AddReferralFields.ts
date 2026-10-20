import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralFields1700000000000 implements MigrationInterface {
  name = 'AddReferralFields1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN referral_code VARCHAR(8) UNIQUE;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IDX_users_referral_code
      ON users (referral_code);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION generate_referral_code()
      RETURNS VARCHAR(8) AS $$
      DECLARE
        chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        result VARCHAR(8) := '';
        i INT;
      BEGIN
        FOR i IN 1..8 LOOP
          result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
        END LOOP;
        RETURN result;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN referral_code SET DEFAULT generate_referral_code();
    `);

    await queryRunner.query(`
      UPDATE users
      SET referral_code = generate_referral_code()
      WHERE referral_code IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN referred_by_id uuid NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT FK_referred_by
      FOREIGN KEY (referred_by_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE referral_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id uuid,
        referred_id uuid,
        reward_paid boolean DEFAULT false,
        reward_paid_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT now(),
        CONSTRAINT FK_referrer FOREIGN KEY (referrer_id) REFERENCES users(id),
        CONSTRAINT FK_referred FOREIGN KEY (referred_id) REFERENCES users(id)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN referral_code DROP DEFAULT;
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS generate_referral_code();`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_referral_code;`);
    await queryRunner.query(`DROP TABLE referral_records;`);
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT FK_referred_by;`,
    );
    await queryRunner.query(`ALTER TABLE users DROP COLUMN referred_by_id;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN referral_code;`);
  }
}
