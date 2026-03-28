import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const mockHealth = {} as any;

  const makeController = (dbMock: any, redisMock: any) => {
    return new HealthController(mockHealth, dbMock, redisMock as any);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('all services healthy -> returns 200 with statuses up', async () => {
    const db = { pingCheck: jest.fn().mockResolvedValueOnce({ database: { status: 'up' } }) };
    const redis = { ping: jest.fn().mockResolvedValueOnce('PONG') };

    controller = makeController(db, redis);

    const res = await controller.check();

    expect(db.pingCheck).toHaveBeenCalledWith('database');
    expect(redis.ping).toHaveBeenCalled();
    expect(res).toEqual({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('database unreachable -> throws 503 with database down', async () => {
    const db = { pingCheck: jest.fn().mockRejectedValueOnce(new Error('db down')) };
    const redis = { ping: jest.fn().mockResolvedValueOnce('PONG') };

    controller = makeController(db, redis);

    try {
      await controller.check();
      throw new Error('Expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((err as HttpException).getResponse()).toEqual({ status: 'error', db: 'down', redis: 'up' });
    }
  });

  it('redis unreachable -> throws 503 with redis down', async () => {
    const db = { pingCheck: jest.fn().mockResolvedValueOnce({ database: { status: 'up' } }) };
    const redis = { ping: jest.fn().mockRejectedValueOnce(new Error('redis down')) };

    controller = makeController(db, redis);

    try {
      await controller.check();
      throw new Error('Expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((err as HttpException).getResponse()).toEqual({ status: 'error', db: 'up', redis: 'down' });
    }
  });

  it('multiple services down -> throws 503 with both down', async () => {
    const db = { pingCheck: jest.fn().mockRejectedValueOnce(new Error('db down')) };
    const redis = { ping: jest.fn().mockRejectedValueOnce(new Error('redis down')) };

    controller = makeController(db, redis);

    try {
      await controller.check();
      throw new Error('Expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((err as HttpException).getResponse()).toEqual({ status: 'error', db: 'down', redis: 'down' });
    }
  });

  it('response shape matches expected DTO for healthy', async () => {
    const db = { pingCheck: jest.fn().mockResolvedValueOnce({ database: { status: 'up' } }) };
    const redis = { ping: jest.fn().mockResolvedValueOnce('PONG') };

    controller = makeController(db, redis);

    const res = await controller.check();
    expect(res).toHaveProperty('status');
    expect(res).toHaveProperty('db');
    expect(res).toHaveProperty('redis');
    expect(typeof res.status).toBe('string');
    expect(typeof res.db).toBe('string');
    expect(typeof res.redis).toBe('string');
  });
});
