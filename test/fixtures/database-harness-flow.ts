import { Controller, Get, Inject, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { TestDatabaseManager } from '../database-manager';

const fixture = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'shared-fixture@example.test',
};

@Controller('fixtures')
class FixtureController {
  constructor(@Inject(DataSource) private readonly source: DataSource) {}

  @Get()
  async list(): Promise<Array<{ id: string; email: string }>> {
    return this.source.query('SELECT id, email FROM users ORDER BY id');
  }

  @Post()
  async create(): Promise<typeof fixture> {
    await this.source.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
      fixture.id,
      fixture.email,
      'fixture-only-hash',
    ]);
    return fixture;
  }
}

export function databaseHarnessFlow(suite: string): void {
  describe(`database harness HTTP lifecycle (${suite})`, () => {
    let app: INestApplication | undefined;
    let connection: DataSource | undefined;

    beforeAll(async () => {
      // Use the application's environment aliases, not the manager's connection.
      connection = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [],
        synchronize: false,
        dropSchema: false,
        extra: { max: 2, connectionTimeoutMillis: 5000 },
      });
      await connection.initialize();
      const module = await Test.createTestingModule({
        controllers: [FixtureController],
        providers: [{ provide: DataSource, useValue: connection }],
      }).compile();
      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      try {
        if (app) await app.close();
      } finally {
        if (connection?.isInitialized) await connection.destroy();
      }
    });

    it('starts with an empty migrated users table', async () => {
      await request(app!.getHttpServer()).get('/fixtures').expect(200, []);
    });

    it('persists the same deterministic fixture independently in each suite', async () => {
      await request(app!.getHttpServer()).post('/fixtures').expect(201, fixture);
    });

    it('preserves intentional journey state between cases', async () => {
      await request(app!.getHttpServer()).get('/fixtures').expect(200, [fixture]);
    });

    it('uses the owned test database for every application alias', async () => {
      const database = TestDatabaseManager.getInstance().settings.database;
      expect(process.env.DB_NAME).toBe(database);
      expect(process.env.DB_DATABASE).toBe(database);
      expect(process.env.DATABASE_NAME).toBe(database);
      expect(await connection!.query('SELECT current_database() AS name')).toEqual([
        { name: database },
      ]);
    });
  });
}
