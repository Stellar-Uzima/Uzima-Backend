import { randomBytes } from 'crypto';
import { DataSourceOptions } from 'typeorm';

type PostgresOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

export interface TestDatabaseSettings {
  database: string;
  connection: PostgresOptions;
}

/** Validate before connecting, and never inherit development credentials. */
export function createTestDatabaseSettings(
  env: NodeJS.ProcessEnv = process.env
): TestDatabaseSettings {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Test database setup requires NODE_ENV=test');
  }
  if (env.TEST_DATABASE_TYPE && env.TEST_DATABASE_TYPE !== 'postgres') {
    throw new Error('E2E tests require TEST_DATABASE_TYPE=postgres');
  }
  for (const key of [
    'TEST_DB_HOST',
    'TEST_DB_PORT',
    'TEST_DB_USERNAME',
    'TEST_DB_PASSWORD',
    'TEST_DB_NAME',
  ]) {
    if (!env[key]?.trim()) {
      throw new Error(`Test database setup requires an explicit ${key}`);
    }
  }
  const base = env.TEST_DB_NAME!;
  if (!/^[a-z][a-z0-9_]{0,34}_test$/.test(base)) {
    throw new Error('TEST_DB_NAME must be a lowercase name ending in _test (max 40 characters)');
  }
  const developmentNames = [env.DB_NAME, env.DB_DATABASE, env.DATABASE_NAME];
  if (developmentNames.includes(base)) {
    throw new Error('TEST_DB_NAME must differ from the development database name');
  }
  const port = Number(env.TEST_DB_PORT);
  if (!/^\d+$/.test(env.TEST_DB_PORT!) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TEST_DB_PORT must be an integer between 1 and 65535');
  }
  const database = `${base}_${randomBytes(8).toString('hex')}`;
  return {
    database,
    connection: {
      type: 'postgres',
      host: env.TEST_DB_HOST,
      port,
      username: env.TEST_DB_USERNAME,
      password: env.TEST_DB_PASSWORD,
      database,
      synchronize: false,
      dropSchema: false,
      logging: false,
      extra: { max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 },
    },
  };
}

/** Route every existing application configuration to the owned test database. */
export function useTestDatabaseEnvironment(
  settings: TestDatabaseSettings,
  env: NodeJS.ProcessEnv = process.env
): void {
  const { connection, database } = settings;
  env.DATABASE_TYPE = 'postgres';
  env.DB_HOST = env.DATABASE_HOST = connection.host;
  env.DB_PORT = env.DATABASE_PORT = String(connection.port);
  env.DB_USER = env.DB_USERNAME = env.DATABASE_USER = env.DATABASE_USERNAME = connection.username;
  env.DB_PASSWORD = env.DATABASE_PASSWORD = connection.password as string;
  env.DB_NAME = env.DB_DATABASE = env.DATABASE_NAME = database;
  // Explicit URLs must not route an application connection back to development.
  delete env.DATABASE_URL;
  delete env.DB_URL;
}
