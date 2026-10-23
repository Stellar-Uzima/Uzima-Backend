import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule, HealthCheckError, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health';
import { QueueHealthIndicator } from './indicators/queue.health';

describe('HealthController', () => {
  let controller: HealthController;
  let db: { pingCheck: jest.Mock };
  let redis: { isHealthy: jest.Mock };
  let queue: { isHealthy: jest.Mock };

  beforeEach(async () => {
    db = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    redis = {
      isHealthy: jest.fn().mockResolvedValue({
        redis: { status: 'up', message: 'Redis connection is healthy' },
      }),
    };

    queue = {
      isHealthy: jest.fn().mockResolvedValue({
        queue: { status: 'up', message: 'All queue connections are healthy' },
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: TypeOrmHealthIndicator, useValue: db },
        { provide: RedisHealthIndicator, useValue: redis },
        { provide: QueueHealthIndicator, useValue: queue },
      ],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /health/liveness', () => {
    it('returns ok with process status and uptime without checking dependencies', async () => {
      const result = await controller.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.info?.process?.status).toBe('up');
      expect(typeof result.info?.process?.uptime).toBe('number');
      expect(db.pingCheck).not.toHaveBeenCalled();
      expect(redis.isHealthy).not.toHaveBeenCalled();
      expect(queue.isHealthy).not.toHaveBeenCalled();
    });

    it('remains healthy even when database and redis are down', async () => {
      db.pingCheck.mockRejectedValue(
        new HealthCheckError('DB down', { database: { status: 'down' } })
      );
      redis.isHealthy.mockRejectedValue(
        new HealthCheckError('Redis down', { redis: { status: 'down' } })
      );

      const result = await controller.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.info?.process?.status).toBe('up');
      expect(db.pingCheck).not.toHaveBeenCalled();
      expect(redis.isHealthy).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/readiness', () => {
    it('returns ok when both database and redis are healthy', async () => {
      const result = await controller.getReadiness();

      expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 1000 });
      expect(redis.isHealthy).toHaveBeenCalledWith('redis', 1000);
      expect(result.status).toBe('ok');
      expect(result.info?.database?.status).toBe('up');
      expect(result.info?.redis?.status).toBe('up');
    });

    it('fails with 503 error when database is unreachable', async () => {
      db.pingCheck.mockRejectedValueOnce(
        new HealthCheckError('Database check failed', {
          database: { status: 'down', message: 'connection refused' },
        })
      );

      await expect(controller.getReadiness()).rejects.toMatchObject({
        response: {
          status: 'error',
          error: {
            database: { status: 'down', message: 'connection refused' },
          },
        },
      });
    });

    it('fails with 503 error when redis is unreachable', async () => {
      redis.isHealthy.mockRejectedValueOnce(
        new HealthCheckError('Redis check failed', {
          redis: { status: 'down', error: 'Redis connection unavailable' },
        })
      );

      await expect(controller.getReadiness()).rejects.toMatchObject({
        response: {
          status: 'error',
          error: {
            redis: { status: 'down', error: 'Redis connection unavailable' },
          },
        },
      });
    });
  });

  describe('GET /health (backward compatibility)', () => {
    it('returns ok when database, redis, and queue are healthy', async () => {
      const result = await controller.check();

      expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 1000 });
      expect(redis.isHealthy).toHaveBeenCalledWith('redis', 1000);
      expect(queue.isHealthy).toHaveBeenCalledWith('queue');
      expect(result.status).toBe('ok');
    });

    it('fails when any dependency fails', async () => {
      db.pingCheck.mockRejectedValueOnce(
        new HealthCheckError('Database down', { database: { status: 'down' } })
      );

      await expect(controller.check()).rejects.toMatchObject({
        response: {
          status: 'error',
          error: { database: { status: 'down' } },
        },
      });
    });
  });

  describe('Subsystem endpoints', () => {
    it('GET /health/redis checks redis dependency', async () => {
      const result = await controller.checkRedis();
      expect(redis.isHealthy).toHaveBeenCalledWith('redis', 1000);
      expect(result.status).toBe('ok');
    });

    it('GET /health/queue checks queue dependency', async () => {
      const result = await controller.checkQueue();
      expect(queue.isHealthy).toHaveBeenCalledWith('queue');
      expect(result.status).toBe('ok');
    });
  });
});
