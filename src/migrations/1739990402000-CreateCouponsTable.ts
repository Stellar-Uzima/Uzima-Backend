import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateCouponsTable1739990402000 implements MigrationInterface {
  name = 'CreateCouponsTable1739990402000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create coupons table
    await queryRunner.createTable(
      new Table({
        name: 'coupons',
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
            name: 'code',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'xlmValue',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'redeemed', 'expired'],
            default: "'active'",
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
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

    // Add foreign key to users table
    await queryRunner.createForeignKey(
      'coupons',
      new TableForeignKey({
        name: 'fk_coupons_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.dropForeignKey(
      'coupons',
      'fk_coupons_user',
    );

    // Drop the table
    await queryRunner.dropTable('coupons');
  }
}
