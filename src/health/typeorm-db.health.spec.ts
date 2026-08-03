import { Test } from '@nestjs/testing';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';

describe('TypeOrmHealthIndicator (database readiness)', () => {
  let indicator: TypeOrmHealthIndicator;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
    }).compile();

    // TypeOrmHealthIndicator is request/transient-scoped in Terminus,
    // so it must be resolved rather than fetched with .get()
    indicator = await moduleRef.resolve(TypeOrmHealthIndicator);
  });

  it('reports the database as up when the ping query succeeds', async () => {
    const fakeConnection = {
      options: { type: 'postgres' },
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const result = await indicator.pingCheck('database', {
      connection: fakeConnection as any,
    });

    expect(fakeConnection.query).toHaveBeenCalledWith('SELECT 1');
    expect(result.database.status).toBe('up');
  });

  it('reports the database as down when the ping query throws', async () => {
    const fakeConnection = {
      options: { type: 'postgres' },
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    };

    const result = await indicator.pingCheck('database', {
      connection: fakeConnection as any,
    });

    expect(result.database.status).toBe('down');
  });

  it('reports the database as down when the ping exceeds the timeout', async () => {
    const fakeConnection = {
      options: { type: 'postgres' },
      // Never resolves within the timeout window, simulating a hung connection
      query: jest.fn(() => new Promise(() => {})),
    };

    const result = await indicator.pingCheck('database', {
      connection: fakeConnection as any,
      timeout: 50,
    });

    expect(result.database.status).toBe('down');
    expect(result.database.message).toMatch(/timeout/i);
  });
});
