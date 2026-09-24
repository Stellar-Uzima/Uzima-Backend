import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Creates the per-user onboarding checklist table (#1378).
 */
export class CreateOnboardingProgress1787000001000 implements MigrationInterface {
  name = 'CreateOnboardingProgress1787000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_progress',
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
            isUnique: true,
          },
          {
            name: 'steps',
            type: 'jsonb',
          },
          {
            name: 'currentStep',
            type: 'int',
            default: 0,
          },
          {
            name: 'completed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'completedAt',
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
      'onboarding_progress',
      new TableIndex({
        name: 'IDX_onboarding_progress_completedAt',
        columnNames: ['completedAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('onboarding_progress', true);
  }
}