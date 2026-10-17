import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { TestDatabaseManager } from './database-manager';
import { InitialSchema1700000000000 } from '../src/database/migrations/1700000000000-InitialSchema';

class FailingSchema1700000000000 implements MigrationInterface {
  async up(_runner: QueryRunner): Promise<void> {
    throw new Error('intentional migration failure');
  }
  async down(_runner: QueryRunner): Promise<void> {
    /* No schema created. */
  }
}

describe('test database lifecycle (real PostgreSQL)', () => {
  const managers: TestDatabaseManager[] = [];
  let admin: DataSource;

  function manager(migrations: Array<new () => MigrationInterface> = []): TestDatabaseManager {
    const result = new TestDatabaseManager({ entities: [], migrations });
    managers.push(result);
    return result;
  }

  beforeAll(async () => {
    admin = new DataSource({ ...manager().settings.connection, database: 'postgres' });
    await admin.initialize();
  });

  afterEach(async () => {
    await Promise.all(managers.map((item) => item.close()));
  });

  afterAll(async () => {
    if (admin?.isInitialized) await admin.destroy();
  });

  async function exists(database: string): Promise<boolean> {
    const rows: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    return rows.length === 1;
  }

  it('repeats real initial-schema fixtures across an application connection without losing migration history', async () => {
    const target = manager([InitialSchema1700000000000]);
    const source = await target.initialize();
    const application = new DataSource({ ...target.settings.connection, entities: [] });
    try {
      await application.initialize();
      for (let run = 0; run < 3; run++) {
        await target.cleanDatabase();
        expect(await application.query('SELECT count(*)::int AS count FROM users')).toEqual([
          { count: 0 },
        ]);
        await application.query(
          'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
          ['00000000-0000-4000-8000-000000000001', 'fixture@example.test', 'fixture-only-hash']
        );
        expect(await source.query('SELECT id, email FROM users')).toEqual([
          { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.test' },
        ]);
        expect(await source.query('SELECT name FROM migrations')).toEqual([
          { name: 'InitialSchema1700000000000' },
        ]);
      }
    } finally {
      if (application.isInitialized) await application.destroy();
    }
    await target.close();
    expect(await exists(target.settings.database)).toBe(false);
  });

  it('isolates simultaneous suites and resets FK fixtures and sequences deterministically', async () => {
    const left = manager();
    const right = manager();
    const [a, b] = await Promise.all([left.initialize(), right.initialize()]);
    expect(a.options.database).not.toBe(b.options.database);
    await a.query('CREATE TABLE parents (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)');
    await a.query(
      'CREATE TABLE children (id SERIAL PRIMARY KEY, parent_id INTEGER REFERENCES parents(id))'
    );
    await b.query('CREATE TABLE sentinel (value TEXT NOT NULL)');
    await b.query('INSERT INTO sentinel VALUES ($1)', ['keep-me']);
    for (let run = 0; run < 3; run++) {
      await left.cleanDatabase();
      expect(
        await a.query('INSERT INTO parents (name) VALUES ($1) RETURNING id', ['fixture-parent'])
      ).toEqual([{ id: 1 }]);
      await a.query('INSERT INTO children (parent_id) VALUES ($1)', [1]);
    }
    await left.cleanDatabase();
    expect(await a.query('SELECT count(*)::int AS count FROM children')).toEqual([{ count: 0 }]);
    expect(await b.query('SELECT value FROM sentinel')).toEqual([{ value: 'keep-me' }]);
    await left.close();
    await left.close();
    expect(await exists(left.settings.database)).toBe(false);
    expect(await exists(right.settings.database)).toBe(true);
    expect(await b.query('SELECT value FROM sentinel')).toEqual([{ value: 'keep-me' }]);
  });

  it('does not adopt or delete a pre-existing database after CREATE fails', async () => {
    const target = manager();
    await admin.query('CREATE DATABASE "' + target.settings.database + '"');
    try {
      await expect(target.initialize()).rejects.toThrow('already exists');
      await target.close();
      expect(await exists(target.settings.database)).toBe(true);
    } finally {
      await admin.query('DROP DATABASE "' + target.settings.database + '"');
    }
  });

  it('drops its database when migration setup fails and remains retryable', async () => {
    const target = manager([FailingSchema1700000000000]);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(target.initialize()).rejects.toThrow('intentional migration failure');
      expect(await exists(target.settings.database)).toBe(false);
      expect(() => target.getDataSource()).toThrow('not initialized');
    }
  });

  it('shares concurrent initialization, rolls back failed work and releases connections', async () => {
    const target = manager();
    const [a, b] = await Promise.all([target.initialize(), target.initialize()]);
    expect(a).toBe(b);
    await a.query('CREATE TABLE items (id INTEGER PRIMARY KEY)');
    await expect(
      target.withTransaction(async (runner) => {
        await runner.query('INSERT INTO items VALUES ($1)', [1]);
        throw new Error('failed test');
      })
    ).rejects.toThrow('failed test');
    expect(await a.query('SELECT count(*)::int AS count FROM items')).toEqual([{ count: 0 }]);
    await target.withTransaction(async (runner) => {
      await runner.query('INSERT INTO items VALUES ($1)', [2]);
    });
    expect(await a.query('SELECT id FROM items')).toEqual([{ id: 2 }]);
  });

  it('surfaces cleanup errors and safely quotes table names', async () => {
    const target = manager();
    const source = await target.initialize();
    await source.query('CREATE TABLE sentinel (id INTEGER)');
    await source.query('INSERT INTO sentinel VALUES (7)');
    await expect(target.clearTable('missing')).rejects.toThrow();
    await expect(target.clearTable('sentinel"; DROP TABLE sentinel; --')).rejects.toThrow();
    expect(await source.query('SELECT id FROM sentinel')).toEqual([{ id: 7 }]);
  });
});
