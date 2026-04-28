/**
 * Test Database Setup Module
 * 
 * This module provides comprehensive test database configuration including:
 * - Test database initialization and connection
 * - Test data seeding
 * - Cleanup and isolation between tests
 * - Transaction-based isolation for test independence
 */

import 'dotenv/config';
import { DataSource, Repository } from 'typeorm';
import { Logger } from '@nestjs/common';

// Test database configuration - separate from production
export const testDatabaseConfig = {
  type: 'postgres' as const,
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  username: process.env.TEST_DB_USERNAME || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres',
  database: process.env.TEST_DB_NAME || 'uzima_test',
  entities: [process.cwd() + '/src/**/*.entity.{ts,js}'],
  migrations: ['src/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  synchronize: true, // Auto-sync schema for tests
  dropSchema: false,
  logging: process.env.TEST_DB_LOGGING === 'true',
  ssl: false,
  extra: {
    max: 5, // Smaller pool for tests
    min: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  },
};

/**
 * Test Database Manager
 * Handles database connection, setup, and cleanup for tests
 */
export class TestDatabaseManager {
  private static instance: TestDatabaseManager;
  private dataSource: DataSource | null = null;
  private readonly logger = new Logger('TestDatabaseManager');
  private isInitialized = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TestDatabaseManager {
    if (!this.instance) {
      this.instance = new TestDatabaseManager();
    }
    return this.instance;
  }

  /**
   * Initialize database connection and setup test schema
   */
  async initialize(): Promise<DataSource> {
    if (this.isInitialized && this.dataSource) {
      return this.dataSource;
    }

    try {
      this.logger.log('Initializing test database...');
      
      this.dataSource = new DataSource(testDatabaseConfig);
      await this.dataSource.initialize();
      
      // Run migrations to set up schema
      if (this.dataSource.migrations && this.dataSource.migrations.length > 0) {
        this.logger.log('Running migrations...');
        await this.dataSource.runMigrations();
      } else {
        this.logger.log('No migrations found, using synchronize for schema setup');
      }

      this.isInitialized = true;
      this.logger.log('Test database initialized successfully');
      return this.dataSource;
    } catch (error) {
      this.logger.error('Failed to initialize test database', error);
      throw error;
    }
  }

  /**
   * Get database connection
   */
  getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  /**
   * Get repository instance
   */
  getRepository<Entity>(entityClass: new () => Entity): Repository<Entity> {
    return this.getDataSource().getRepository(entityClass);
  }

  /**
   * Clean all tables and reset sequences
   */
  async cleanDatabase(): Promise<void> {
    if (!this.dataSource) {
      throw new Error('Database not initialized');
    }

    try {
      this.logger.log('Cleaning database...');
      
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        // Disable foreign key constraints
        await queryRunner.query('SET CONSTRAINTS ALL DEFERRED');

        // Get all tables
        const tables = await queryRunner.query(`
          SELECT tablename FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename NOT IN ('migrations')
          ORDER BY tablename DESC
        `);

        // Truncate all tables
        for (const { tablename } of tables) {
          try {
            await queryRunner.query(`TRUNCATE TABLE "${tablename}" CASCADE`);
          } catch (error) {
            this.logger.warn(`Failed to truncate ${tablename}: ${error}`);
          }
        }

        // Re-enable foreign key constraints
        await queryRunner.query('SET CONSTRAINTS ALL IMMEDIATE');
        
        this.logger.log('Database cleaned successfully');
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error('Failed to clean database', error);
      throw error;
    }
  }

  /**
   * Clear specific table
   */
  async clearTable(tableName: string): Promise<void> {
    if (!this.dataSource) {
      throw new Error('Database not initialized');
    }

    try {
      await this.dataSource.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
      this.logger.log(`Table ${tableName} cleared`);
    } catch (error) {
      this.logger.error(`Failed to clear table ${tableName}`, error);
      throw error;
    }
  }

  /**
   * Clear tables in specific order for data dependency
   */
  async clearTablesByDependency(tables: string[]): Promise<void> {
    for (const table of tables) {
      await this.clearTable(table);
    }
  }

  /**
   * Wrap test in a transaction for isolation
   * This allows operations to be rolled back after each test
   */
  async withTransaction<T>(
    callback: (queryRunner: any) => Promise<T>,
  ): Promise<T> {
    if (!this.dataSource) {
      throw new Error('Database not initialized');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await callback(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.dataSource) {
      try {
        this.logger.log('Closing test database connection...');
        await this.dataSource.destroy();
        this.dataSource = null;
        this.isInitialized = false;
        this.logger.log('Test database connection closed');
      } catch (error) {
        this.logger.error('Failed to close database connection', error);
        throw error;
      }
    }
  }

  /**
   * Reset database to initial state
   * Cleans all data and optionally reseeds
   */
  async reset(reseed: boolean = false): Promise<void> {
    await this.cleanDatabase();
    if (reseed) {
      this.logger.log('Reseeding test data...');
      // Seeding will be handled by factories
    }
  }
}

/**
 * Jest setup hooks
 * Run before and after all tests
 */
export async function setupTestDatabase(): Promise<void> {
  const manager = TestDatabaseManager.getInstance();
  await manager.initialize();
}

export async function teardownTestDatabase(): Promise<void> {
  const manager = TestDatabaseManager.getInstance();
  await manager.close();
}

/**
 * Per-test setup/cleanup
 * Cleans database before each test for isolation
 */
export async function beforeEachTest(): Promise<void> {
  const manager = TestDatabaseManager.getInstance();
  await manager.cleanDatabase();
}

export async function afterEachTest(): Promise<void> {
  // Additional cleanup if needed
}

/**
 * Transaction helper for test isolation
 * Allows each test to run in an isolated transaction
 */
export class IsolatedTestRunner {
  private dbManager = TestDatabaseManager.getInstance();

  async runTest<T>(testFn: () => Promise<T>): Promise<T> {
    return this.dbManager.withTransaction(async () => {
      return testFn();
    });
  }

  /**
   * Run multiple isolated tests in sequence
   */
  async runTests<T>(
    tests: Array<{ name: string; fn: () => Promise<T> }>,
  ): Promise<Array<{ name: string; result?: T; error?: Error }>> {
    const results = [];
    for (const test of tests) {
      try {
        const result = await this.runTest(test.fn);
        results.push({ name: test.name, result });
      } catch (error) {
        results.push({ name: test.name, error: error as Error });
      }
    }
    return results;
  }
}

/**
 * Test fixture manager for consistent test data setup
 */
export class TestFixtureManager {
  private dbManager = TestDatabaseManager.getInstance();
  private fixtures: Map<string, any[]> = new Map();

  /**
   * Register fixture data
   */
  registerFixture<T>(name: string, data: T[]): void {
    this.fixtures.set(name, data);
  }

  /**
   * Get fixture data
   */
  getFixture<T>(name: string): T[] {
    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(`Fixture '${name}' not found`);
    }
    return fixture as T[];
  }

  /**
   * Load fixtures into database
   */
  async loadFixture<Entity>(
    name: string,
    repository: Repository<Entity>,
  ): Promise<Entity[]> {
    const data = this.getFixture<Entity>(name);
    return repository.save(data);
  }

  /**
   * Load multiple fixtures
   */
  async loadFixtures(
    fixtures: Array<{ name: string; repository: Repository<any> }>,
  ): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();
    for (const { name, repository } of fixtures) {
      const data = await this.loadFixture(name, repository);
      results.set(name, data);
    }
    return results;
  }

  /**
   * Clear all registered fixtures
   */
  clearFixtures(): void {
    this.fixtures.clear();
  }
}
