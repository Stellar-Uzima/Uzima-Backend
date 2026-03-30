import { Logger } from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let db: { pingCheck: jest.Mock };
  let redis: { isHealthy: jest.Mock };

  const makeController = () => new HealthController(db as any, redis as any);

  beforeEach(() => {
    db = {
      pingCheck: jest.fn().mockResolvedValue({ db: { status: 'up' } }),
    };

    redis = {
      isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up', responseTime: 4 } }),
    };

    controller = makeController();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns top-level dependency statuses when services are healthy', async () => {
    const response = await controller.check();

    expect(db.pingCheck).toHaveBeenCalledWith('db');
    expect(redis.isHealthy).toHaveBeenCalledWith('redis');
    expect(response).toEqual({
      status: 'ok',
      db: { status: 'up' },
      redis: { status: 'up', responseTime: 4 },
    });
  });

  it('logs at error level and rethrows when a health check fails', async () => {
    redis.isHealthy.mockRejectedValueOnce(
      new HealthCheckError('Redis unavailable', {
        redis: { status: 'down', responseTime: 9 },
      }),
    );

    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(controller.check()).rejects.toMatchObject({
      response: {
        status: 'error',
        db: { status: 'up' },
        redis: { status: 'down', responseTime: 9 },
      },
      status: 503,
    });

    expect(loggerSpy).toHaveBeenCalledWith(
      'Health check failed: {"status":"error","db":{"status":"up"},"redis":{"status":"down","responseTime":9}}',
    );
  });
});
