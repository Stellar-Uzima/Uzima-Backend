import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('RedisHealthIndicator', () => {
  it('returns redis up with response time when redis is reachable', async () => {
    const redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    const indicator = new RedisHealthIndicator(redis as any);
    const result = await indicator.isHealthy('redis');

    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(result.redis.status).toBe('up');
    expect(typeof result.redis.responseTime).toBe('number');
  });

  it('throws HealthCheckError with redis down when redis is unreachable', async () => {
    const redis = {
      ping: jest.fn().mockRejectedValue(new Error('redis down')),
    };

    const indicator = new RedisHealthIndicator(redis as any);

    await expect(indicator.isHealthy('redis')).rejects.toMatchObject({
      causes: {
        redis: {
          status: 'down',
        },
      },
    } satisfies Partial<HealthCheckError>);
  });
});
