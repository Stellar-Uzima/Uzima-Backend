import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Creates the `user_consent_records` table backing (#1372). One logical
 * record per `(userId, consentType)` (rewritten on change) so consent state
 * is idempotent and auditable via created/updated timestamps, capture source
 * and policy version.
 */
export class CreateUserConsentRecords1785000001000 implements MigrationInterface {
  name = 'CreateUserConsentRecords1785000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_consent_records_consenttype_enum AS ENUM (
          'marketing_email',
          'marketing_push',
          'marketing_sms',
          'analytics',
          'data_processing',
          'third_party_sharing'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_consent_records_status_enum AS ENUM (
          'granted',
          'denied',
          'withdrawn'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_consent_records_source_enum AS ENUM (
          'onboarding',
          'settings',
          'api',
          'legal'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'user_consent_records',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'consentType',
            type: 'user_consent_records_consenttype_enum',
          },
          {
            name: 'status',
            type: 'user_consent_records_status_enum',
          },
          {
            name: 'source',
            type: 'user_consent_records_source_enum',
            default: `'api'`,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '20',
            default: `'1.0'`,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'grantedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'withdrawnAt',
            type: 'timestamp',
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
      'user_consent_records',
      new TableIndex({
        name: 'IDX_user_consent_records_user_consentType',
        columnNames: ['userId', 'consentType'],
      }),
    );
    await queryRunner.createIndex(
      'user_consent_records',
      new TableIndex({
        name: 'IDX_user_consent_records_user_status',
        columnNames: ['userId', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_consent_records', true);
    await queryRunner.query(`DROP TYPE IF EXISTS user_consent_records_source_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_consent_records_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_consent_records_consenttype_enum`);
  }
}