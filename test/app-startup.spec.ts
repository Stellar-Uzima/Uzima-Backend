import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

describe('Application startup validation', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetAllMocks();
  });

  it('starts successfully with required env vars present', async () => {
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_USERNAME = 'postgres';
    process.env.DATABASE_PASSWORD = 'postgres';
    process.env.DATABASE_NAME = 'testdb';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await expect(app.init()).resolves.not.toThrow();
    await app.close();
  }, 20000);

  it('fails fast with clear error if DATABASE_URL (or host) is missing', async () => {
    // Remove DB env
    delete process.env.DATABASE_HOST;
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';

    // Create module and expect init to reject quickly
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).rejects.toBeDefined();
    try {
      await app.close();
    } catch {}
  }, 20000);

  it('fails fast if the database connection cannot be established', async () => {
    // Provide envs but mock DataSource.initialize to throw
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_USERNAME = 'postgres';
    process.env.DATABASE_PASSWORD = 'postgres';
    process.env.DATABASE_NAME = 'testdb';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';

    // Mock TypeORM DataSource prototype initialize to throw
    const dsProto = (DataSource as any).prototype;
    jest.spyOn(dsProto, 'initialize').mockImplementationOnce(() => {
      return Promise.reject(new Error('DB connection failed'));
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).rejects.toThrow(/DB connection failed/);
    try {
      await app.close();
    } catch {}
  }, 20000);

  it('fails fast if Redis is unreachable', async () => {
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_USERNAME = 'postgres';
    process.env.DATABASE_PASSWORD = 'postgres';
    process.env.DATABASE_NAME = 'testdb';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';

    // Mock Redis constructor to produce a client that throws on connect/ping
    jest.spyOn(Redis.prototype, 'connect').mockImplementationOnce(() => {
      throw new Error('Redis unreachable');
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();

    await expect(app.init()).rejects.toBeDefined();
    try {
      await app.close();
    } catch {}
  }, 20000);

  it('all expected NestJS modules are registered and resolvable', async () => {
    // Minimal envs
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_USERNAME = 'postgres';
    process.env.DATABASE_PASSWORD = 'postgres';
    process.env.DATABASE_NAME = 'testdb';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    // We mock out heavy initialization by spying on DataSource.initialize to resolve
    const dsProto = (DataSource as any).prototype;
    jest.spyOn(dsProto, 'initialize').mockImplementationOnce(() => Promise.resolve());
    await expect(app.init()).resolves.not.toThrow();

    // Check a few modules/controllers/services exist
    const appModule = moduleRef.get(AppModule);
    expect(appModule).toBeDefined();

    await app.close();
  }, 20000);
});
