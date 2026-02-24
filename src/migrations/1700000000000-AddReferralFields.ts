import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralFields1700000000000 implements MigrationInterface {
  name = 'AddReferralFields1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN referral_code VARCHAR(8) UNIQUE;
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
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    await queryRunner.query(`DROP TABLE referral_records;`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT FK_referred_by;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN referred_by_id;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN referral_code;`);
  }
}