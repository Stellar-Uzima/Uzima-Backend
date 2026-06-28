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
});
