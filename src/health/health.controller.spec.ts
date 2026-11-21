import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let health: { check: jest.Mock };
  let db: { pingCheck: jest.Mock };
  let redis: { isHealthy: jest.Mock };
  let queue: { isHealthy: jest.Mock };

  const makeController = () =>
    new HealthController(health as any, db as any, redis as any, queue as any);

  beforeEach(() => {
    health = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
    db = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    redis = {
      isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up', responseTime: 4 } }),
    };

    queue = {
      isHealthy: jest.fn().mockResolvedValue({ queue: { status: 'up' } }),
    };

    controller = makeController();
  });

  it('checks database, Redis, and queue health without a scheduled-job indicator', async () => {
    await controller.check();

    const [checks] = health.check.mock.calls[0];
    expect(checks).toHaveLength(3);
    await Promise.all(checks.map((check: () => Promise<unknown>) => check()));
    expect(db.pingCheck).toHaveBeenCalledWith('database');
    expect(redis.isHealthy).toHaveBeenCalledWith('redis');
    expect(queue.isHealthy).toHaveBeenCalledWith('queue');
  });

  it('checks queue health on the queue endpoint', async () => {
    await controller.checkQueue();

    const [checks] = health.check.mock.calls[0];
    expect(checks).toHaveLength(1);
    await checks[0]();
    expect(queue.isHealthy).toHaveBeenCalledWith('queue');
  });
});
