import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let headers: Record<string, string>;
  let context: ExecutionContext;

  beforeEach(() => {
    guard = new RateLimitGuard({ throttlers: [] } as any, {} as any, {} as any);
    headers = {};
    context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          ip: '127.0.0.1',
        }),
        getResponse: () => ({
          set: (key: string, value: string) => {
            headers[key] = value;
          },
        }),
      }),
    } as ExecutionContext;
    
    // Add storageService mock to the guard instance
    (guard as any).storageService = {
      getRecord: jest.fn().mockResolvedValue({ totalHits: 1 }),
    };
    (guard as any).generateKey = jest.fn().mockReturnValue('test-key');
  });

  it('sets rate limit headers when throttling with proper conversion to seconds', async () => {
    await expect(
      guard['throwThrottlingException'](context, {
        limit: 5,
        ttl: 900000, // 15 minutes in milliseconds
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
    expect(headers['Retry-After']).toBe('900'); // Converts ms to seconds correctly
    expect(headers['X-RateLimit-Reset']).toBeDefined(); // Unix timestamp is set

    try {
      await guard['throwThrottlingException'](context, {
        limit: 5,
        ttl: 900000,
        key: 'test',
        tracker: 'test',
        totalHits: 6,
        timeToExpire: 900,
        isBlocked: true,
        timeToBlockExpire: 900,
      });
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).getResponse()).toEqual(expect.objectContaining({
        message: 'Too Many Requests',
        error: 'Rate limit exceeded. Please try again later.',
      }));
    }
  });

  it('extracts correct client IP from X-Forwarded-For header', () => {
    const req = {
      headers: {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
      },
    } as any;

    const tracker = guard['getTracker'](req);
    expect(tracker).toBe('192.168.1.1');
  });

  it('extracts correct client IP from X-Real-IP header', () => {
    const req = {
      headers: {
        'x-real-ip': '192.168.1.1',
      },
    } as any;

    const tracker = guard['getTracker'](req);
    expect(tracker).toBe('192.168.1.1');
  });

  it('falls back to socket remote address when no proxy headers exist', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    const tracker = guard['getTracker'](req);
    expect(tracker).toBe('127.0.0.1');
  });

  it('falls back to request.ip when socket is not available', () => {
    const req = {
      headers: {},
      ip: '127.0.0.1',
    } as any;

    const tracker = guard['getTracker'](req);
    expect(tracker).toBe('127.0.0.1');
  });

  it('returns "unknown" when no IP can be determined', () => {
    const req = {
      headers: {},
    } as any;

    const tracker = guard['getTracker'](req);
    expect(tracker).toBe('unknown');
  });

  it('calculates correct remaining requests in handleRequest', async () => {
    (guard as any).storageService.getRecord.mockResolvedValue({ totalHits: 50 });
    
    await guard['handleRequest']({
      context,
      limit: 100,
      ttl: 60000,
      ttlRemaining: 60000,
      throttler: { name: 'default', limit: 100, ttl: 60000 },
    });

    expect(headers['X-RateLimit-Remaining']).toBe('50'); // 100 - 50 = 50 remaining
    expect(headers['X-RateLimit-Limit']).toBe('100');
    expect(headers['X-RateLimit-Reset']).toBe('60'); // Converts 60000ms to 60s
  });

  it('never returns negative remaining requests', async () => {
    (guard as any).storageService.getRecord.mockResolvedValue({ totalHits: 150 });
    
    await guard['handleRequest']({
      context,
      limit: 100,
      ttl: 60000,
      ttlRemaining: 60000,
      throttler: { name: 'default', limit: 100, ttl: 60000 },
    });

    expect(headers['X-RateLimit-Remaining']).toBe('0'); // Never negative
  });
});