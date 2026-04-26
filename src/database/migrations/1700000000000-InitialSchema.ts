import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid extension if not present
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'email', type: 'varchar', length: '255', isUnique: true, isNullable: false },
          { name: 'password_hash', type: 'varchar', length: '255', isNullable: false },
          { name: 'first_name', type: 'varchar', length: '100', isNullable: true },
          { name: 'last_name', type: 'varchar', length: '100', isNullable: true },
          {
            name: 'roles',
            type: 'text',
            isArray: true,
            default: '\'{"user"}\'',
            isNullable: false,
          },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'refresh_token_hash', type: 'varchar', length: '255', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true // ifNotExists
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_USERS_EMAIL', columnNames: ['email'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_USERS_EMAIL');
    await queryRunner.dropTable('users', true);
  }
}
