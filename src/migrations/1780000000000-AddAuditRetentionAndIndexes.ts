import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddAuditRetentionAndIndexes1780000000000 implements MigrationInterface {
  name = 'AddAuditRetentionAndIndexes1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add retention expiration column to audit_logs table
    await queryRunner.addColumn(
      'audit_logs',
      new TableColumn({
        name: 'retention_expires_at',
        type: 'timestamp with time zone',
        isNullable: true,
        precision: 6,
      }),
    );

    // Create indexes for improved query performance
    // Index on createdAt for sorting and filtering by date
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_created_at_desc',
        columnNames: ['created_at'],
        isUnique: false,
      }),
    );

    // Index on retention_expires_at for efficient cleanup queries
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_retention_expires_at',
        columnNames: ['retention_expires_at'],
        isUnique: false,
      }),
    );

    // Composite index for common queries on created_at and user_id
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_user_id_created_at',
        columnNames: ['user_id', 'created_at'],
        isUnique: false,
      }),
    );

    // Composite index for compliance queries
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_is_compliance_created_at',
        columnNames: ['is_compliance_event', 'created_at'],
        isUnique: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_is_compliance_created_at');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_user_id_created_at');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_retention_expires_at');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_created_at_desc');

    // Remove retention column
    await queryRunner.dropColumn('audit_logs', 'retention_expires_at');
  }
}
