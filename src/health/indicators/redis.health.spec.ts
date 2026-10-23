import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { CacheService } from '../../shared/cache/cache.service';

describe('RedisHealthIndicator (readiness indicator)', () => {
  let indicator: RedisHealthIndicator;
  let cacheService: { ping: jest.Mock };

  beforeEach(() => {
    cacheService = {
      ping: jest.fn().mockResolvedValue(true),
    };
    indicator = new RedisHealthIndicator(cacheService as unknown as CacheService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports redis as up when ping succeeds', async () => {
    const result = await indicator.isHealthy('redis', 1000);

    expect(cacheService.ping).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      redis: {
        status: 'up',
        message: 'Redis connection is healthy',
      },
    });
  });

  it('throws HealthCheckError and reports down when ping fails', async () => {
    cacheService.ping.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

    await expect(indicator.isHealthy('redis', 1000)).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('redis', 1000)).rejects.toMatchObject({
      causes: {
        redis: {
          status: 'down',
          error: 'Redis connection unavailable',
        },
      },
    });
  });

  it('sanitizes errors and avoids exposing connection URLs or passwords', async () => {
    cacheService.ping.mockRejectedValue(
      new Error('Auth failed for redis://default:supersecretpassword@internal.host:6379')
    );

    try {
      await indicator.isHealthy('redis', 1000);
      fail('Expected isHealthy to throw');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HealthCheckError);
      expect(err.causes.redis.status).toBe('down');
      expect(err.causes.redis.error).toBe('Redis connection unavailable');
      expect(JSON.stringify(err.causes)).not.toContain('supersecretpassword');
      expect(JSON.stringify(err.causes)).not.toContain('internal.host');
    }
  });

  it('reports down and times out when ping exceeds the deadline', async () => {
    // Simulate a hung connection that does not resolve
    cacheService.ping.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)));

    await expect(indicator.isHealthy('redis', 50)).rejects.toMatchObject({
      causes: {
        redis: {
          status: 'down',
          error: 'Redis health check timed out',
        },
      },
    });
  });

  it('does not trigger an unhandled promise rejection when ping rejects after timeout', async () => {
    let rejectDelayedPing!: (reason?: any) => void;
    const delayedPingPromise = new Promise((_, reject) => {
      rejectDelayedPing = reject;
    });

    cacheService.ping.mockReturnValue(delayedPingPromise);

    const unhandledRejections: any[] = [];
    const onUnhandled = (reason: any) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      // Health check times out at 30ms
      await expect(indicator.isHealthy('redis', 30)).rejects.toMatchObject({
        causes: {
          redis: {
            status: 'down',
            error: 'Redis health check timed out',
          },
        },
      });

      // Now reject the delayed ping AFTER the timeout has already won the race
      rejectDelayedPing(new Error('Delayed socket ECONNREFUSED'));

      // Wait for any microtask or rejection event to propagate
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
