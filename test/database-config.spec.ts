import { DataSource } from 'typeorm';
import { createTestDatabaseSettings, useTestDatabaseEnvironment } from './database-config';
import { setupTestDB } from './setup';

const validEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  TEST_DATABASE_TYPE: 'postgres',
  TEST_DB_HOST: 'test-host',
  TEST_DB_PORT: '5432',
  TEST_DB_USERNAME: 'test-user',
  TEST_DB_PASSWORD: 'test-password',
  TEST_DB_NAME: 'uzima_test',
});

describe('test database configuration', () => {
  it.each(['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_USERNAME', 'TEST_DB_PASSWORD', 'TEST_DB_NAME'])(
    'requires %s instead of inheriting development configuration',
    (key) => {
      const env: NodeJS.ProcessEnv = {
        ...validEnvironment(),
        DB_HOST: 'development',
        DB_NAME: 'uzima_dev',
      };
      delete env[key];
      expect(() => createTestDatabaseSettings(env)).toThrow(key);
    }
  );

  it.each(['uzima_dev', 'postgres', 'template1', 'uzima_test;DROP DATABASE dev', '../uzima_test'])(
    'rejects unsafe database base %s',
    (name) => {
      expect(() =>
        createTestDatabaseSettings({ ...validEnvironment(), TEST_DB_NAME: name })
      ).toThrow('TEST_DB_NAME');
    }
  );

  it.each(['DB_NAME', 'DB_DATABASE', 'DATABASE_NAME'])('rejects a base matching %s', (key) => {
    expect(() =>
      createTestDatabaseSettings({ ...validEnvironment(), [key]: 'uzima_test' })
    ).toThrow('development');
  });

  it.each(['0', '65536', 'abc', '5432junk', '1.5'])('rejects invalid port %s', (port) =>
    expect(() => createTestDatabaseSettings({ ...validEnvironment(), TEST_DB_PORT: port })).toThrow(
      'TEST_DB_PORT'
    )
  );

  it('rejects production execution and unsupported engines', () => {
    expect(() =>
      createTestDatabaseSettings({ ...validEnvironment(), NODE_ENV: 'production' })
    ).toThrow('NODE_ENV');
    expect(() =>
      createTestDatabaseSettings({ ...validEnvironment(), TEST_DATABASE_TYPE: 'sqlite' })
    ).toThrow('postgres');
  });

  it('generates independent names and routes every app alias to the same test target', () => {
    const settings = createTestDatabaseSettings(validEnvironment());
    const other = createTestDatabaseSettings(validEnvironment());
    expect(settings.database).not.toBe(other.database);
    expect(settings.database).toMatch(/^uzima_test_[a-f0-9]{16}$/);
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgres://development',
      DB_URL: 'postgres://development',
    };
    useTestDatabaseEnvironment(settings, env);
    for (const key of ['DB_NAME', 'DB_DATABASE', 'DATABASE_NAME'])
      expect(env[key]).toBe(settings.database);
    expect(env.DB_HOST).toBe('test-host');
    expect(env.DATABASE_USERNAME).toBe('test-user');
    expect(env.DB_PASSWORD).toBe('test-password');
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DB_URL).toBeUndefined();
  });

  it('legacy setup refuses development-only settings before opening a connection', async () => {
    const original = process.env;
    process.env = { NODE_ENV: 'test', DB_NAME: 'uzima_dev' };
    const initialize = jest.spyOn(DataSource.prototype, 'initialize');
    try {
      await expect(setupTestDB()).rejects.toThrow('TEST_DB_HOST');
      expect(initialize).not.toHaveBeenCalled();
    } finally {
      initialize.mockRestore();
      process.env = original;
    }
  });
});
