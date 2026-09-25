import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateCustomerSegments1785000000000 implements MigrationInterface {
  name = 'CreateCustomerSegments1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create customer_segments table
    await queryRunner.createTable(
      new Table({
        name: 'customer_segments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'criteria',
            type: 'jsonb',
            comment: 'Deterministic criteria for segment membership (e.g., { "minAge": 18, "country": "NG" })',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'memberCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'lastCalculatedAt',
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
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'customer_segments',
      new TableIndex({
        name: 'IDX_customer_segments_isActive',
        columnNames: ['isActive'],
      }),
    );

    await queryRunner.createIndex(
      'customer_segments',
      new TableIndex({
        name: 'IDX_customer_segments_lastCalculatedAt',
        columnNames: ['lastCalculatedAt'],
      }),
    );

    // Create user_segment_memberships junction table
    await queryRunner.createTable(
      new Table({
        name: 'user_segment_memberships',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'segmentId',
            type: 'uuid',
          },
          {
            name: 'matchedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'user_segment_memberships',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_segment_memberships',
      new TableForeignKey({
        columnNames: ['segmentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'customer_segments',
        onDelete: 'CASCADE',
      }),
    );

    // Create unique index for userId-segmentId pair
    await queryRunner.createIndex(
      'user_segment_memberships',
      new TableIndex({
        name: 'IDX_user_segment_memberships_unique',
        columnNames: ['userId', 'segmentId'],
        isUnique: true,
      }),
    );

    // Create index for querying users by segment
    await queryRunner.createIndex(
      'user_segment_memberships',
      new TableIndex({
        name: 'IDX_user_segment_memberships_segmentId',
        columnNames: ['segmentId'],
      }),
    );

    // Create index for querying segments by user
    await queryRunner.createIndex(
      'user_segment_memberships',
      new TableIndex({
        name: 'IDX_user_segment_memberships_userId',
        columnNames: ['userId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_segment_memberships');
    await queryRunner.dropTable('customer_segments');
  }
}
