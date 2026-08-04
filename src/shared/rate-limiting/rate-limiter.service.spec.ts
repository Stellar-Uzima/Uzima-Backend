import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimiterService } from './rate-limiter.service';

const mockIncr = jest.fn();
const mockExpire = jest.fn();
const mockTtl = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    incr: mockIncr,
    expire: mockExpire,
    ttl: mockTtl,
  }));
});

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string, defaultValue: any) => defaultValue),
    } as unknown as ConfigService;

    service = new RateLimiterService(configService);
  });

  it('should create a Redis-backed rate limiter service', () => {
    expect(service).toBeDefined();
    expect(Redis).toHaveBeenCalled();
  });

  it('should allow the first user request and return rate limit headers', async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(59);

    const status = await service.consumeUser('user-123', { userLimit: 5, userWindowSeconds: 60 });

    expect(status.allowed).toBe(true);
    expect(status.current).toBe(1);
    expect(status.limit).toBe(5);
    expect(status.remaining).toBe(4);
    expect(status.ttl).toBe(59);
    expect(status.type).toBe('user');
    expect(status.key).toContain('user:user-123');
    expect(mockExpire).toHaveBeenCalledWith(status.key, 60);
  });

  it('should block when the IP rate limit is exceeded', async () => {
    mockIncr.mockResolvedValue(10);
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(1);

    const status = await service.consumeIp('127.0.0.1', { ipLimit: 5, ipWindowSeconds: 60 });

    expect(status.allowed).toBe(false);
    expect(status.current).toBe(10);
    expect(status.limit).toBe(5);
    expect(status.remaining).toBe(0);
    expect(status.type).toBe('ip');
  });

  it('should handle concurrent requests at the exact limit boundary', async () => {
    const limit = 5;
    // Simulate 5 concurrent increments returning values 1-5, all exactly at boundary
    let counter = 0;
    mockIncr.mockImplementation(() => Promise.resolve(++counter));
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(30);

    const requests = Array.from({ length: limit }, () =>
      service.consumeUser('user-boundary', { userLimit: limit, userWindowSeconds: 60 }),
    );

    const results = await Promise.all(requests);

    // All requests at or below the limit should be allowed
    expect(results.every((r) => r.allowed)).toBe(true);
    // Each request should have a unique current count
    const counts = results.map((r) => r.current).sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    // The last allowed request should have 0 remaining
    const lastRequest = results.find((r) => r.current === limit)!;
    expect(lastRequest.remaining).toBe(0);
  });

  it('should allow requests again after the window resets', async () => {
    mockExpire.mockResolvedValue(1);

    // First window: user hits the limit
    mockIncr.mockResolvedValue(6);
    mockTtl.mockResolvedValue(1);

    const blocked = await service.consumeUser('user-reset', { userLimit: 5, userWindowSeconds: 60 });
    expect(blocked.allowed).toBe(false);

    // Window expires — Redis key is gone, next incr starts fresh at 1
    mockIncr.mockResolvedValue(1);
    mockTtl.mockResolvedValue(60);

    const allowed = await service.consumeUser('user-reset', { userLimit: 5, userWindowSeconds: 60 });
    expect(allowed.allowed).toBe(true);
    expect(allowed.current).toBe(1);
    expect(allowed.remaining).toBe(4);
    // A new window was set on the fresh key
    expect(mockExpire).toHaveBeenLastCalledWith(allowed.key, 60);
  });
});
