import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Creates the audit table for referral-reward and reward-claim attempts,
 * backing the (#1373) anti-abuse guard.
 */
export class CreateClaimAttemptLogs1786000000000 implements MigrationInterface {
  name = 'CreateClaimAttemptLogs1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE claim_attempt_logs_attempttype_enum AS ENUM (
          'referral_redemption',
          'reward_claim'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE claim_attempt_logs_outcome_enum AS ENUM (
          'allowed',
          'denied'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'claim_attempt_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'attemptType',
            type: 'claim_attempt_logs_attempttype_enum',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'outcome',
            type: 'claim_attempt_logs_outcome_enum',
          },
          {
            name: 'denialReason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'claim_attempt_logs',
      new TableIndex({
        name: 'IDX_claim_attempt_logs_type_outcome',
        columnNames: ['attemptType', 'outcome'],
      }),
    );
    await queryRunner.createIndex(
      'claim_attempt_logs',
      new TableIndex({
        name: 'IDX_claim_attempt_logs_userId',
        columnNames: ['userId'],
      }),
    );
    await queryRunner.createIndex(
      'claim_attempt_logs',
      new TableIndex({
        name: 'IDX_claim_attempt_logs_createdAt',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('claim_attempt_logs', true);
    await queryRunner.query(`DROP TYPE IF EXISTS claim_attempt_logs_outcome_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS claim_attempt_logs_attempttype_enum`);
  }
}