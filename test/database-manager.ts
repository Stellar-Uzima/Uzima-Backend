
import { resolve } from 'path';
import {
  DataSource,
  DataSourceOptions,
  ObjectLiteral,
  QueryRunner,
  Repository,
} from 'typeorm';
import {
  createTestDatabaseSettings,
  TestDatabaseSettings,
} from './database-config';

const quoteIdentifier = (name: string): string =>
  `"${name.replace(/"/g, '""')}"`;

const DEFAULT_SCHEMA: SchemaOptions = {
  entities: [resolve(__dirname, '../src/**/*.entity.ts')],
  migrations: [resolve(__dirname, '../src/database/migrations/*.ts')],
};

type SchemaOptions = Pick<DataSourceOptions, 'entities' | 'migrations'>;

const EXCLUDED_TABLES = ['migrations', 'typeorm_metadata'];

const ADMIN_CONNECTION_OPTIONS = {
  max: 1,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000,
};

/** Manages an isolated PostgreSQL database for a test suite. */
export class TestDatabaseManager {
  private static instance: TestDatabaseManager;

  readonly settings: TestDatabaseSettings;

  private dataSource: DataSource | null = null;
  private ownsDatabase = false;
  private initializing: Promise<DataSource> | null = null;

  constructor(
    private readonly schema: SchemaOptions = DEFAULT_SCHEMA,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.settings = createTestDatabaseSettings(env);

    Object.freeze(this.settings.connection);
    Object.freeze(this.settings);
  }

  static getInstance(schema?: SchemaOptions): TestDatabaseManager {
    if (this.instance && schema) {
      throw new Error(
        'Configure the test schema before initializing the suite environment',
      );
    }

    this.instance ??= new TestDatabaseManager(schema);

    return this.instance;
  }

  private async withAdmin<T>(
    callback: (admin: DataSource) => Promise<T>,
  ): Promise<T> {
    const admin = new DataSource({
      ...this.settings.connection,
      database: 'postgres',
      entities: [],
      migrations: [],
      extra: ADMIN_CONNECTION_OPTIONS,
    });

    try {
      await admin.initialize();
      return await callback(admin);
    } finally {
      if (admin.isInitialized) {
        await admin.destroy();
      }
    }
  }

  async initialize(): Promise<DataSource> {
    if (this.dataSource?.isInitialized) {
      return this.dataSource;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.initializeDatabase();

    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeDatabase(): Promise<DataSource> {
    try {
      await this.createDatabase();

      this.dataSource = new DataSource({
        ...this.settings.connection,
        ...this.schema,
      });

      await this.dataSource.initialize();
      await this.dataSource.runMigrations();

      return this.dataSource;
    } catch (error) {
      try {
        await this.close();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Test database setup and cleanup failed',
        );
      }

      throw error;
    }
  }

  private async createDatabase(): Promise<void> {
    await this.withAdmin(async (admin) => {
      // Fail on collision instead of adopting or resetting an existing database.
      await admin.query(
        `CREATE DATABASE ${quoteIdentifier(this.settings.database)}`,
      );

      this.ownsDatabase = true;
    });
  }

  getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) {
      throw new Error(
        'Test database not initialized. Call initialize() first.',
      );
    }

    return this.dataSource;
  }

  getRepository<Entity extends ObjectLiteral>(
    entityClass: new () => Entity,
  ): Repository<Entity> {
    return this.getDataSource().getRepository(entityClass);
  }

  async cleanDatabase(): Promise<void> {
    const source = this.getDataSource();

    const tables: Array<{ tablename: string }> = await source.query(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = $1
       AND tablename NOT IN ($2, $3)`,
      ['public', ...EXCLUDED_TABLES],
    );

    if (tables.length === 0) {
      return;
    }

    const tableNames = tables
      .map(({ tablename }) => `public.${quoteIdentifier(tablename)}`)
      .join(', ');

    // Truncate all tables together to handle foreign keys and reset sequences.
    await source.query(
      `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
    );
  }

  async clearTable(tableName: string): Promise<void> {
    await this.getDataSource().query(
      `TRUNCATE TABLE public.${quoteIdentifier(tableName)}
       RESTART IDENTITY CASCADE`,
    );
  }

  async clearTablesByDependency(tables: string[]): Promise<void> {
    for (const table of tables) {
      await this.clearTable(table);
    }
  }

  async withTransaction<T>(
    callback: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const runner = this.getDataSource().createQueryRunner();

    try {
      await runner.connect();
      await runner.startTransaction();

      const result = await callback(runner);

      await runner.commitTransaction();

      return result;
    } catch (error) {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }

      throw error;
    } finally {
      await runner.release();
    }
  }

  async close(): Promise<void> {
    try {
      if (this.dataSource?.isInitialized) {
        await this.dataSource.destroy();
      }
    } finally {
      this.dataSource = null;

      if (this.ownsDatabase) {
        await this.dropDatabase();
      }
    }
  }

  private async dropDatabase(): Promise<void> {
    await this.withAdmin(async (admin) => {
      // PostgreSQL 15+: terminate remaining connections before dropping.
      await admin.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(this.settings.database)} WITH (FORCE)`,
      );

      this.ownsDatabase = false;
    });
  }

  async reset(): Promise<void> {
    await this.cleanDatabase();
  }
}
