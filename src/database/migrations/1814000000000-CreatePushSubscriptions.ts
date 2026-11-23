import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreatePushSubscriptions1814000000000 implements MigrationInterface {
  name = 'CreatePushSubscriptions1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'push_subscriptions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid' },
          { name: 'deviceToken', type: 'varchar', length: '512' },
          { name: 'platform', type: 'enum', enum: ['ios', 'android', 'web'] },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
        indices: [
          { name: 'IDX_push_subscriptions_user', columnNames: ['userId'] },
          { name: 'IDX_push_subscriptions_token', columnNames: ['deviceToken'] },
        ],
        foreignKeys: [{ columnNames: ['userId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('push_subscriptions');
  }
}
