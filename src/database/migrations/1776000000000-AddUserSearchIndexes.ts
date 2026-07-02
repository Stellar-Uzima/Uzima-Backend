import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddUserSearchIndexes1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create indexes for optimized search performance
    const indexes: TableIndex[] = [
      // Email search index (exact match)
      new TableIndex({
        name: 'IDX_USER_EMAIL',
        columnNames: ['email'],
        isUnique: true,
      }),

      // Name search indexes (for fuzzy matching)
      new TableIndex({
        name: 'IDX_USER_FIRST_NAME',
        columnNames: ['firstName'],
      }),

      new TableIndex({
        name: 'IDX_USER_LAST_NAME',
        columnNames: ['lastName'],
      }),

      new TableIndex({
        name: 'IDX_USER_FULL_NAME',
        columnNames: ['fullName'],
      }),

      // Composite name index for better search performance
      new TableIndex({
        name: 'IDX_USER_NAMES',
        columnNames: ['firstName', 'lastName', 'fullName'],
      }),

      // Filter indexes
      new TableIndex({
        name: 'IDX_USER_ROLE',
        columnNames: ['role'],
      }),

      new TableIndex({
        name: 'IDX_USER_STATUS',
        columnNames: ['status'],
      }),

      new TableIndex({
        name: 'IDX_USER_IS_VERIFIED',
        columnNames: ['isVerified'],
      }),

      new TableIndex({
        name: 'IDX_USER_COUNTRY',
        columnNames: ['country'],
      }),

      new TableIndex({
        name: 'IDX_USER_PREFERRED_LANGUAGE',
        columnNames: ['preferredLanguage'],
      }),

      // Phone number index
      new TableIndex({
        name: 'IDX_USER_PHONE_NUMBER',
        columnNames: ['phoneNumber'],
      }),

      // Avatar index (stored in walletAddress field)
      new TableIndex({
        name: 'IDX_USER_WALLET_ADDRESS',
        columnNames: ['walletAddress'],
      }),

      // Activity indexes for sorting
      new TableIndex({
        name: 'IDX_USER_CREATED_AT',
        columnNames: ['createdAt'],
      }),

      new TableIndex({
        name: 'IDX_USER_UPDATED_AT',
        columnNames: ['updatedAt'],
      }),

      new TableIndex({
        name: 'IDX_USER_LAST_ACTIVE_AT',
        columnNames: ['lastActiveAt'],
      }),

      // Composite indexes for common search patterns
      new TableIndex({
        name: 'IDX_USER_ROLE_STATUS',
        columnNames: ['role', 'status'],
      }),

      new TableIndex({
        name: 'IDX_USER_STATUS_VERIFIED',
        columnNames: ['status', 'isVerified'],
      }),

      new TableIndex({
        name: 'IDX_USER_COUNTRY_STATUS',
        columnNames: ['country', 'status'],
      }),

      // Search optimization: composite index for role + status + created_at
      new TableIndex({
        name: 'IDX_USER_ROLE_STATUS_CREATED',
        columnNames: ['role', 'status', 'createdAt'],
      }),

      // Search optimization: composite index for status + created_at
      new TableIndex({
        name: 'IDX_USER_STATUS_CREATED',
        columnNames: ['status', 'createdAt'],
      }),

      // Search optimization: composite index for isVerified + created_at
      new TableIndex({
        name: 'IDX_USER_VERIFIED_CREATED',
        columnNames: ['isVerified', 'createdAt'],
      }),

      // Full-text search indexes (if supported by the database)
      // Note: These would need to be adjusted based on the specific database being used
      new TableIndex({
        name: 'IDX_USER_SEARCH_FIELDS',
        columnNames: ['email', 'firstName', 'lastName', 'fullName'],
      }),
    ];

    // Add all indexes
    for (const index of indexes) {
      await queryRunner.createIndex('users', index);
    }

    // Create trigram extension for PostgreSQL (if using PostgreSQL)
    // This enables more efficient fuzzy matching
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      
      // Create trigram indexes for fuzzy matching
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_USER_FIRST_NAME_TRIGRAM" 
        ON "users" USING gin (first_name gin_trgm_ops);
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_USER_LAST_NAME_TRIGRAM" 
        ON "users" USING gin (last_name gin_trgm_ops);
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_USER_FULL_NAME_TRIGRAM" 
        ON "users" USING gin (full_name gin_trgm_ops);
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_USER_EMAIL_TRIGRAM" 
        ON "users" USING gin (email gin_trgm_ops);
      `);
    } catch (error) {
      // Trigram extension not available (not PostgreSQL or no permissions)
      // This is not critical, fuzzy matching will still work but may be slower
    }

    // Create full-text search indexes (PostgreSQL specific)
    try {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_USER_FULLTEXT_SEARCH" 
        ON "users" USING gin(
          to_tsvector('english', 
            coalesce(first_name, '') || ' ' || 
            coalesce(last_name, '') || ' ' || 
            coalesce(full_name, '') || ' ' || 
            coalesce(email, '')
          )
        );
      `);
    } catch (error) {
      // Full-text search not available, will use ILIKE instead
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes in reverse order
    const indexNames = [
      'IDX_USER_FULLTEXT_SEARCH',
      'IDX_USER_EMAIL_TRIGRAM',
      'IDX_USER_FULL_NAME_TRIGRAM',
      'IDX_USER_LAST_NAME_TRIGRAM',
      'IDX_USER_FIRST_NAME_TRIGRAM',
      'IDX_USER_SEARCH_FIELDS',
      'IDX_USER_VERIFIED_CREATED',
      'IDX_USER_STATUS_CREATED',
      'IDX_USER_ROLE_STATUS_CREATED',
      'IDX_USER_COUNTRY_STATUS',
      'IDX_USER_STATUS_VERIFIED',
      'IDX_USER_ROLE_STATUS',
      'IDX_USER_LAST_ACTIVE_AT',
      'IDX_USER_UPDATED_AT',
      'IDX_USER_CREATED_AT',
      'IDX_USER_WALLET_ADDRESS',
      'IDX_USER_PHONE_NUMBER',
      'IDX_USER_PREFERRED_LANGUAGE',
      'IDX_USER_COUNTRY',
      'IDX_USER_IS_VERIFIED',
      'IDX_USER_STATUS',
      'IDX_USER_ROLE',
      'IDX_USER_NAMES',
      'IDX_USER_FULL_NAME',
      'IDX_USER_LAST_NAME',
      'IDX_USER_FIRST_NAME',
      'IDX_USER_EMAIL',
    ];

    for (const indexName of indexNames) {
      try {
        await queryRunner.dropIndex('users', indexName);
      } catch (error) {
        // Index might not exist, continue with others
      }
    }

    // Drop trigram extension (PostgreSQL specific)
    try {
      await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm;`);
    } catch (error) {
      // Extension might not exist or no permissions
    }
  }
}
