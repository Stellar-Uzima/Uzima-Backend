import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('sets rate limit headers when throttling', async () => {
    const guard = new RateLimitGuard({ throttlers: [] } as any, {} as any, {} as any);
    const headers: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getResponse: () => ({
          set: (key: string, value: string) => {
            headers[key] = value;
          },
        }),
      }),
    } as ExecutionContext;

    await expect(
      guard['throwThrottlingException'](context, {
        limit: 5,
        ttl: 900,
        key: 'test',
        tracker: 'test',
        totalHits: 6,
        timeToExpire: 900,
        isBlocked: true,
        timeToBlockExpire: 900,
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(headers['Retry-After']).toBe('900');

    try {
      await guard['throwThrottlingException'](context, {
        limit: 5,
        ttl: 900,
        key: 'test',
        tracker: 'test',
        totalHits: 6,
        timeToExpire: 900,
        isBlocked: true,
        timeToBlockExpire: 900,
      });
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });
});
