import { MigrationInterface, QueryRunner, TableIndex, Table, TableColumn } from 'typeorm';

export class CreateEnhancedAuditTrail1775100000000 implements MigrationInterface {
    name = 'CreateEnhancedAuditTrail1775100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if audit_logs table exists and drop it to recreate with enhanced structure
        const tableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'audit_logs'
            );
        `);

        if (tableExists[0].exists) {
            await queryRunner.dropTable('audit_logs');
        }

        // Create enhanced audit_logs table
        await queryRunner.createTable(
            new Table({
                name: 'audit_logs',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'user_id',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'user_email',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'user_role',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'action',
                        type: 'enum',
                        enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT', 'APPROVE', 'REJECT', 'SYSTEM'],
                        isNullable: false,
                    },
                    {
                        name: 'resource_type',
                        type: 'enum',
                        enum: ['USER', 'TASK', 'HEALTH_TASK', 'REMINDER', 'REWARD', 'TRANSACTION', 'ADMIN', 'SYSTEM'],
                        isNullable: false,
                    },
                    {
                        name: 'resource_id',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'resource_name',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'old_values',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'new_values',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'description',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'ip_address',
                        type: 'varchar',
                        length: '45',
                        isNullable: true,
                    },
                    {
                        name: 'user_agent',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'session_id',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'request_id',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'correlation_id',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'tenant_id',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'is_sensitive',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'is_compliance_event',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'compliance_category',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'metadata',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp with time zone',
                        precision: 6,
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'created_by',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'hash',
                        type: 'varchar',
                        length: '64',
                        isUnique: true,
                    },
                    {
                        name: 'previous_hash',
                        type: 'varchar',
                        length: '64',
                        isNullable: true,
                    },
                    {
                        name: 'block_index',
                        type: 'int',
                        isNullable: true,
                    },
                ],
            }),
            true,
        );

        // Create indexes for performance
        const indexes: TableIndex[] = [
            new TableIndex({
                name: 'IDX_audit_logs_user_id',
                columnNames: ['user_id'],
            }),
            new TableIndex({
                name: 'IDX_audit_logs_resource_type_id',
                columnNames: ['resource_type', 'resource_id'],
            }),
            new TableIndex({
                name: 'IDX_audit_logs_action',
                columnNames: ['action'],
            }),
            new TableIndex({
                name: 'IDX_audit_logs_created_at',
                columnNames: ['created_at'],
            }),
            new TableIndex({
                name: 'IDX_audit_logs_user_id_created_at',
                columnNames: ['user_id', 'created_at'],
            }),
            new TableIndex({
                name: 'IDX_audit_logs_compliance_event',
                columnNames: ['is_compliance_event'],
            }),
            new TableIndex({
                name: 'IDX_audit_logs_block_index',
                columnNames: ['block_index'],
            }),
        ];

        for (const index of indexes) {
            await queryRunner.createIndex('audit_logs', index);
        }

        // Create trigger function for automatic hash generation
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION generate_audit_log_hash()
            RETURNS TRIGGER AS $$
            DECLARE
                previous_hash_value VARCHAR(64);
                block_index_value INTEGER;
                data_to_hash TEXT;
            BEGIN
                -- Get previous hash and block index
                SELECT COALESCE(MAX(hash), '0000000000000000000000000000000000000000000000000000000000000000000'),
                       COALESCE(MAX(block_index), 0) + 1
                INTO previous_hash_value, block_index_value
                FROM audit_logs;

                -- Create data to hash
                data_to_hash := NEW.id || COALESCE(NEW.user_id, '') || NEW.action || 
                               NEW.resource_type || COALESCE(NEW.resource_id, '') || 
                               NEW.created_at || previous_hash_value;

                -- Set hash, previous_hash, and block_index
                NEW.hash := encode(sha256(data_to_hash::bytea), 'hex');
                NEW.previous_hash := previous_hash_value;
                NEW.block_index := block_index_value;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Create trigger for automatic hash generation
        await queryRunner.query(`
            CREATE TRIGGER trigger_generate_audit_log_hash
            BEFORE INSERT ON audit_logs
            FOR EACH ROW
            EXECUTE FUNCTION generate_audit_log_hash();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop trigger and function
        await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_generate_audit_log_hash ON audit_logs`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS generate_audit_log_hash()`);

        // Drop indexes
        const indexNames = [
            'IDX_audit_logs_user_id',
            'IDX_audit_logs_resource_type_id',
            'IDX_audit_logs_action',
            'IDX_audit_logs_created_at',
            'IDX_audit_logs_user_id_created_at',
            'IDX_audit_logs_compliance_event',
            'IDX_audit_logs_block_index',
        ];

        for (const indexName of indexNames) {
            await queryRunner.dropIndex('audit_logs', indexName);
        }

        // Drop table
        await queryRunner.dropTable('audit_logs');
    }
}
