import { resolve } from 'path';
import { DataSource, DataSourceOptions, ObjectLiteral, QueryRunner, Repository } from 'typeorm';
import { createTestDatabaseSettings, TestDatabaseSettings } from './database-config';

const quoteIdentifier = (name: string): string => '"' + name.replace(/"/g, '""') + '"';
type SchemaOptions = Pick<DataSourceOptions, 'entities' | 'migrations'>;

/** One newly created PostgreSQL database per suite, with explicit ownership. */
export class TestDatabaseManager {
  private static instance: TestDatabaseManager;
  readonly settings: TestDatabaseSettings;
  private dataSource: DataSource | null = null;
  private ownsDatabase = false;
  private initializing: Promise<DataSource> | null = null;

  constructor(
    private readonly schema: SchemaOptions = {
      entities: [resolve(__dirname, '../src/**/*.entity.ts')],
      migrations: [resolve(__dirname, '../src/database/migrations/*.ts')],
    },
    env: NodeJS.ProcessEnv = process.env
  ) {
    this.settings = createTestDatabaseSettings(env);
    Object.freeze(this.settings.connection);
    Object.freeze(this.settings);
  }

  static getInstance(): TestDatabaseManager {
    if (!this.instance) this.instance = new TestDatabaseManager();
    return this.instance;
  }

  private async withAdmin<T>(callback: (admin: DataSource) => Promise<T>): Promise<T> {
    const admin = new DataSource({
      ...this.settings.connection,
      database: 'postgres',
      entities: [],
      migrations: [],
      extra: { max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 },
    });
    try {
      await admin.initialize();
      return await callback(admin);
    } finally {
      if (admin.isInitialized) await admin.destroy();
    }
  }

  async initialize(): Promise<DataSource> {
    if (this.initializing) return this.initializing;
    if (this.dataSource?.isInitialized) return this.dataSource;
    this.initializing = this.initializeDatabase();
    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeDatabase(): Promise<DataSource> {
    try {
      await this.withAdmin(async (admin) => {
        // A collision must fail, never adopt or reset an existing database.
        await admin.query('CREATE DATABASE ' + quoteIdentifier(this.settings.database));
        this.ownsDatabase = true;
      });
      this.dataSource = new DataSource({ ...this.settings.connection, ...this.schema });
      await this.dataSource.initialize();
      await this.dataSource.runMigrations();
      return this.dataSource;
    } catch (error) {
      try {
        await this.close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Test database setup and cleanup failed');
      }
      throw error;
    }
  }

  getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) {
      throw new Error('Test database not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  getRepository<Entity extends ObjectLiteral>(entityClass: new () => Entity): Repository<Entity> {
    return this.getDataSource().getRepository(entityClass);
  }

  async cleanDatabase(): Promise<void> {
    const source = this.getDataSource();
    const tables: Array<{ tablename: string }> = await source.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename NOT IN ('migrations', 'typeorm_metadata')",
      ['public']
    );
    if (tables.length) {
      // One atomic statement handles foreign keys and resets fixture sequences.
      await source.query(
        'TRUNCATE TABLE ' +
          tables.map(({ tablename }) => 'public.' + quoteIdentifier(tablename)).join(', ') +
          ' RESTART IDENTITY CASCADE'
      );
    }
  }

  async clearTable(tableName: string): Promise<void> {
    await this.getDataSource().query(
      'TRUNCATE TABLE public.' + quoteIdentifier(tableName) + ' RESTART IDENTITY CASCADE'
    );
  }

  async clearTablesByDependency(tables: string[]): Promise<void> {
    for (const table of tables) await this.clearTable(table);
  }

  async withTransaction<T>(callback: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
    const runner = this.getDataSource().createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      try {
        const result = await callback(runner);
        await runner.commitTransaction();
        return result;
      } catch (error) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      await runner.release();
    }
  }

  async close(): Promise<void> {
    try {
      if (this.dataSource?.isInitialized) await this.dataSource.destroy();
    } finally {
      this.dataSource = null;
      if (this.ownsDatabase) {
        await this.withAdmin(async (admin) => {
          // PG15: terminate only leftover pools connected to our generated database.
          await admin.query(
            'DROP DATABASE IF EXISTS ' + quoteIdentifier(this.settings.database) + ' WITH (FORCE)'
          );
          this.ownsDatabase = false;
        });
      }
    }
  }

  async reset(): Promise<void> {
    await this.cleanDatabase();
  }
}
