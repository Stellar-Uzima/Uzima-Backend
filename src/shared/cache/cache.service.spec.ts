import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

// ── ioredis mock ──────────────────────────────────────────────────────────────
const mockConnect = jest.fn();
const mockOn = jest.fn();
const mockSet = jest.fn();
const mockSetex = jest.fn();
const mockGet = jest.fn();
const mockDel = jest.fn();
const mockExists = jest.fn();
const mockExpire = jest.fn();
const mockTtl = jest.fn();
const mockIncrby = jest.fn();
const mockDecrby = jest.fn();
const mockLpush = jest.fn();
const mockLrange = jest.fn();
const mockSadd = jest.fn();
const mockSmembers = jest.fn();
const mockKeys = jest.fn();
const mockFlushall = jest.fn();
const mockInfo = jest.fn();
const mockDbsize = jest.fn();
const mockMget = jest.fn();
const mockMsetRedis = jest.fn();
const mockQuit = jest.fn();
const mockPipelineExec = jest.fn();
const mockPipelineExpire = jest.fn();
const mockPipeline = jest.fn();

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    on: mockOn,
    set: mockSet,
    setex: mockSetex,
    get: mockGet,
    del: mockDel,
    exists: mockExists,
    expire: mockExpire,
    ttl: mockTtl,
    incrby: mockIncrby,
    decrby: mockDecrby,
    lpush: mockLpush,
    lrange: mockLrange,
    sadd: mockSadd,
    smembers: mockSmembers,
    keys: mockKeys,
    flushall: mockFlushall,
    info: mockInfo,
    dbsize: mockDbsize,
    mget: mockMget,
    mset: mockMsetRedis,
    quit: mockQuit,
    pipeline: mockPipeline,
  })),
);

jest.mock('../../config/redis.config', () => ({
  redisConfig: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    db: 0,
    tls: false,
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────

function makeConfigService(overrides: Record<string, any> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key in overrides) return overrides[key];
      if (key === 'CACHE_DEFAULT_TTL') return 3600;
      return defaultValue;
    }),
  } as unknown as ConfigService;
}

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-apply default implementations after clearAllMocks
    mockConnect.mockResolvedValue(undefined);
    mockOn.mockReturnValue(undefined);
    mockSet.mockResolvedValue('OK');
    mockSetex.mockResolvedValue('OK');
    mockGet.mockResolvedValue(null);
    mockDel.mockResolvedValue(1);
    mockExists.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(3600);
    mockIncrby.mockResolvedValue(1);
    mockDecrby.mockResolvedValue(-1);
    mockLpush.mockResolvedValue(1);
    mockLrange.mockResolvedValue([]);
    mockSadd.mockResolvedValue(1);
    mockSmembers.mockResolvedValue([]);
    mockKeys.mockResolvedValue([]);
    mockFlushall.mockResolvedValue('OK');
    mockInfo.mockResolvedValue('used_memory_human:1.50M\r\n');
    mockDbsize.mockResolvedValue(0);
    mockMget.mockResolvedValue([]);
    mockMsetRedis.mockResolvedValue('OK');
    mockQuit.mockResolvedValue('OK');
    mockPipelineExpire.mockReturnThis();
    mockPipelineExec.mockResolvedValue([]);
    mockPipeline.mockReturnValue({ expire: mockPipelineExpire, exec: mockPipelineExec });

    service = new CacheService(makeConfigService());
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // onModuleInit / onModuleDestroy
  // ──────────────────────────────────────────────────────────────────────────
  describe('onModuleInit', () => {
    it('should connect to Redis on init', () => {
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should register connect, error, and reconnecting event listeners', () => {
      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });

  describe('onModuleDestroy', () => {
    it('should call redis.quit to close the connection', async () => {
      await service.onModuleDestroy();
      expect(mockQuit).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // set – storage and TTL behaviour
  // ──────────────────────────────────────────────────────────────────────────
  describe('set', () => {
    it('should call redis.setex with the key, TTL, and serialised value when TTL > 0', async () => {
      await service.set('my-key', { foo: 'bar' }, { ttl: 60 });

      expect(mockSetex).toHaveBeenCalledWith('my-key', 60, JSON.stringify({ foo: 'bar' }));
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should fall back to config default TTL when options.ttl is 0 (falsy coercion)', async () => {
      // The service uses `options.ttl || configDefault` so 0 is treated as "no override"
      // and the config default (3600) is used instead — setex is still called.
      await service.set('my-key', 'value', { ttl: 0 });

      expect(mockSetex).toHaveBeenCalledWith('my-key', 3600, JSON.stringify('value'));
    });

    it('should call redis.set (no expiry) when both options.ttl and config default are 0', async () => {
      const svc = new CacheService(makeConfigService({ CACHE_DEFAULT_TTL: 0 }));
      await svc.onModuleInit();

      await svc.set('no-expiry', 'v', { ttl: 0 });

      expect(mockSet).toHaveBeenCalledWith('no-expiry', JSON.stringify('v'));
      expect(mockSetex).not.toHaveBeenCalled();
    });

    it('should use the default TTL from config when no TTL option is provided', async () => {
      const svc = new CacheService(makeConfigService({ CACHE_DEFAULT_TTL: 1800 }));
      await svc.onModuleInit();

      await svc.set('key', 'value');

      expect(mockSetex).toHaveBeenCalledWith('key', 1800, JSON.stringify('value'));
    });

    it('should serialise non-string values as JSON', async () => {
      await service.set('obj-key', { nested: [1, 2, 3] }, { ttl: 300 });

      expect(mockSetex).toHaveBeenCalledWith(
        'obj-key',
        300,
        JSON.stringify({ nested: [1, 2, 3] }),
      );
    });

    it('should re-throw when redis.setex fails', async () => {
      mockSetex.mockRejectedValueOnce(new Error('Redis connection lost'));
      await expect(service.set('k', 'v', { ttl: 10 })).rejects.toThrow('Redis connection lost');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // setIfNotExists
  // ──────────────────────────────────────────────────────────────────────────
  describe('setIfNotExists', () => {
    it('should return true when Redis sets the key (response is "OK")', async () => {
      mockSet.mockResolvedValueOnce('OK');
      expect(await service.setIfNotExists('lock-key', 1, 30)).toBe(true);
    });

    it('should return false when the key already exists (Redis returns null)', async () => {
      mockSet.mockResolvedValueOnce(null);
      expect(await service.setIfNotExists('lock-key', 1, 30)).toBe(false);
    });

    it('should call redis.set with EX and NX flags', async () => {
      mockSet.mockResolvedValueOnce('OK');
      await service.setIfNotExists('lock-key', { data: true }, 60);

      expect(mockSet).toHaveBeenCalledWith(
        'lock-key',
        JSON.stringify({ data: true }),
        'EX',
        60,
        'NX',
      );
    });

    it('should return true (conservative) when Redis throws an error', async () => {
      mockSet.mockRejectedValueOnce(new Error('timeout'));
      expect(await service.setIfNotExists('k', 1, 30)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // get – cache hit, miss, and error
  // ──────────────────────────────────────────────────────────────────────────
  describe('get', () => {
    it('should return the deserialised value on a cache hit', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ user: 'alice' }));
      const result = await service.get<{ user: string }>('user:alice');
      expect(result).toEqual({ user: 'alice' });
    });

    it('should return null on a cache miss (Redis returns null)', async () => {
      mockGet.mockResolvedValueOnce(null);
      expect(await service.get('missing-key')).toBeNull();
    });

    it('should return null (not throw) when Redis errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('network error'));
      await expect(service.get('k')).resolves.toBeNull();
    });

    it('should deserialise primitive values correctly', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify(42));
      expect(await service.get<number>('counter')).toBe(42);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // del
  // ──────────────────────────────────────────────────────────────────────────
  describe('del', () => {
    it('should call redis.del with the given key', async () => {
      await service.del('stale-key');
      expect(mockDel).toHaveBeenCalledWith('stale-key');
    });

    it('should re-throw when redis.del fails', async () => {
      mockDel.mockRejectedValueOnce(new Error('del failed'));
      await expect(service.del('k')).rejects.toThrow('del failed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // exists
  // ──────────────────────────────────────────────────────────────────────────
  describe('exists', () => {
    it('should return true when Redis reports the key exists (result = 1)', async () => {
      mockExists.mockResolvedValueOnce(1);
      expect(await service.exists('some-key')).toBe(true);
    });

    it('should return false when the key does not exist (result = 0)', async () => {
      mockExists.mockResolvedValueOnce(0);
      expect(await service.exists('missing-key')).toBe(false);
    });

    it('should return false (not throw) when Redis errors', async () => {
      mockExists.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.exists('k')).resolves.toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // expire / ttl
  // ──────────────────────────────────────────────────────────────────────────
  describe('expire', () => {
    it('should call redis.expire with the key and TTL', async () => {
      await service.expire('session:123', 900);
      expect(mockExpire).toHaveBeenCalledWith('session:123', 900);
    });

    it('should re-throw when redis.expire fails', async () => {
      mockExpire.mockRejectedValueOnce(new Error('expire failed'));
      await expect(service.expire('k', 10)).rejects.toThrow('expire failed');
    });
  });

  describe('ttl', () => {
    it('should return the remaining TTL from Redis', async () => {
      mockTtl.mockResolvedValueOnce(250);
      expect(await service.ttl('session:123')).toBe(250);
    });

    it('should return -1 when Redis errors', async () => {
      mockTtl.mockRejectedValueOnce(new Error('ttl error'));
      expect(await service.ttl('k')).toBe(-1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // incr / decr
  // ──────────────────────────────────────────────────────────────────────────
  describe('incr', () => {
    it('should call redis.incrby with amount 1 by default', async () => {
      mockIncrby.mockResolvedValueOnce(5);
      expect(await service.incr('counter')).toBe(5);
      expect(mockIncrby).toHaveBeenCalledWith('counter', 1);
    });

    it('should call redis.incrby with a custom amount', async () => {
      mockIncrby.mockResolvedValueOnce(10);
      await service.incr('counter', 5);
      expect(mockIncrby).toHaveBeenCalledWith('counter', 5);
    });

    it('should re-throw when redis.incrby fails', async () => {
      mockIncrby.mockRejectedValueOnce(new Error('incr failed'));
      await expect(service.incr('k')).rejects.toThrow('incr failed');
    });
  });

  describe('decr', () => {
    it('should call redis.decrby with amount 1 by default', async () => {
      mockDecrby.mockResolvedValueOnce(3);
      expect(await service.decr('counter')).toBe(3);
      expect(mockDecrby).toHaveBeenCalledWith('counter', 1);
    });

    it('should call redis.decrby with a custom amount', async () => {
      mockDecrby.mockResolvedValueOnce(-5);
      await service.decr('counter', 10);
      expect(mockDecrby).toHaveBeenCalledWith('counter', 10);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // list operations: lpush / lrange
  // ──────────────────────────────────────────────────────────────────────────
  describe('lpush', () => {
    it('should serialise each value to JSON before pushing', async () => {
      mockLpush.mockResolvedValueOnce(2);
      await service.lpush('list-key', { a: 1 }, { b: 2 });

      expect(mockLpush).toHaveBeenCalledWith(
        'list-key',
        JSON.stringify({ a: 1 }),
        JSON.stringify({ b: 2 }),
      );
    });

    it('should re-throw on Redis error', async () => {
      mockLpush.mockRejectedValueOnce(new Error('lpush failed'));
      await expect(service.lpush('k', 'v')).rejects.toThrow('lpush failed');
    });
  });

  describe('lrange', () => {
    it('should deserialise each item from JSON', async () => {
      mockLrange.mockResolvedValueOnce([JSON.stringify(1), JSON.stringify(2)]);
      const result = await service.lrange<number>('list-key', 0, -1);
      expect(result).toEqual([1, 2]);
    });

    it('should return an empty array on Redis error', async () => {
      mockLrange.mockRejectedValueOnce(new Error('lrange failed'));
      await expect(service.lrange('k')).resolves.toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // set operations: sadd / smembers
  // ──────────────────────────────────────────────────────────────────────────
  describe('sadd', () => {
    it('should serialise values to JSON before adding to the set', async () => {
      mockSadd.mockResolvedValueOnce(1);
      await service.sadd('tag-set', 'tag1', 'tag2');

      expect(mockSadd).toHaveBeenCalledWith(
        'tag-set',
        JSON.stringify('tag1'),
        JSON.stringify('tag2'),
      );
    });
  });

  describe('smembers', () => {
    it('should deserialise members from JSON', async () => {
      mockSmembers.mockResolvedValueOnce([JSON.stringify('alpha'), JSON.stringify('beta')]);
      const result = await service.smembers<string>('tag-set');
      expect(result).toEqual(['alpha', 'beta']);
    });

    it('should return an empty array on Redis error', async () => {
      mockSmembers.mockRejectedValueOnce(new Error('smembers failed'));
      await expect(service.smembers('k')).resolves.toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // clearPattern / keys / flushAll
  // ──────────────────────────────────────────────────────────────────────────
  describe('clearPattern', () => {
    it('should return 0 without calling del when no keys match', async () => {
      mockKeys.mockResolvedValueOnce([]);
      const count = await service.clearPattern('session:*');
      expect(count).toBe(0);
      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should delete all matching keys and return the deleted count', async () => {
      mockKeys.mockResolvedValueOnce(['session:1', 'session:2']);
      mockDel.mockResolvedValueOnce(2);
      const count = await service.clearPattern('session:*');
      expect(mockDel).toHaveBeenCalledWith('session:1', 'session:2');
      expect(count).toBe(2);
    });

    it('should re-throw on Redis error', async () => {
      mockKeys.mockRejectedValueOnce(new Error('keys failed'));
      await expect(service.clearPattern('*')).rejects.toThrow('keys failed');
    });
  });

  describe('keys', () => {
    it('should return matching keys from Redis', async () => {
      mockKeys.mockResolvedValueOnce(['user:1', 'user:2']);
      expect(await service.keys('user:*')).toEqual(['user:1', 'user:2']);
    });

    it('should return an empty array on Redis error', async () => {
      mockKeys.mockRejectedValueOnce(new Error('keys failed'));
      await expect(service.keys('*')).resolves.toEqual([]);
    });
  });

  describe('flushAll', () => {
    it('should call redis.flushall', async () => {
      await service.flushAll();
      expect(mockFlushall).toHaveBeenCalledTimes(1);
    });

    it('should re-throw on Redis error', async () => {
      mockFlushall.mockRejectedValueOnce(new Error('flush failed'));
      await expect(service.flushAll()).rejects.toThrow('flush failed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getStats – hit/miss rate and memory parsing
  // ──────────────────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('should reflect hit and miss counts accumulated from get() calls', async () => {
      // Produce 2 hits and 1 miss
      mockGet.mockResolvedValueOnce(JSON.stringify('hit1'));
      mockGet.mockResolvedValueOnce(JSON.stringify('hit2'));
      mockGet.mockResolvedValueOnce(null);

      await service.get('k1');
      await service.get('k2');
      await service.get('k3');

      mockDbsize.mockResolvedValueOnce(5);
      const stats = await service.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(66.67); // 2/3 * 100
    });

    it('should parse the memory value from Redis info output', async () => {
      mockInfo.mockResolvedValueOnce('used_memory_human:2.50M\r\n');
      mockDbsize.mockResolvedValueOnce(10);
      const stats = await service.getStats();
      expect(stats.memory).toBe('2.50M');
      expect(stats.keys).toBe(10);
    });

    it('should return a zero-hit-rate fallback when Redis errors', async () => {
      mockInfo.mockRejectedValueOnce(new Error('info failed'));
      const stats = await service.getStats();
      expect(stats.keys).toBe(0);
      expect(stats.memory).toBe('0B');
      expect(stats.hitRate).toBe(0);
    });

    it('should report hitRate of 0 when no requests have been made', async () => {
      const stats = await service.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // remember – cache-miss fallback (key acceptance criterion)
  // ──────────────────────────────────────────────────────────────────────────
  describe('remember', () => {
    it('should return the cached value without calling the fetcher on a cache hit', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ data: 'from-cache' }));
      const fetcher = jest.fn();

      const result = await service.remember('my-key', fetcher, 300);

      expect(result).toEqual({ data: 'from-cache' });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call the fetcher and cache the result on a cache miss', async () => {
      mockGet.mockResolvedValueOnce(null); // cache miss
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh' });

      const result = await service.remember('my-key', fetcher, 300);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: 'fresh' });
      expect(mockSetex).toHaveBeenCalledWith(
        'my-key',
        300,
        JSON.stringify({ data: 'fresh' }),
      );
    });

    it('should use the default TTL of 3600 s when no TTL is provided', async () => {
      mockGet.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockResolvedValue('value');

      await service.remember('key', fetcher);

      expect(mockSetex).toHaveBeenCalledWith('key', 3600, JSON.stringify('value'));
    });

    it('should re-throw when the fetcher throws and nothing is cached', async () => {
      mockGet.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockRejectedValue(new Error('db down'));

      await expect(service.remember('key', fetcher)).rejects.toThrow('db down');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // rememberWithStaleFallback – expiry and stale-while-error
  // ──────────────────────────────────────────────────────────────────────────
  describe('rememberWithStaleFallback', () => {
    it('should return the cached value immediately when TTL > 0 (fresh hit)', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ cached: true }));
      mockTtl.mockResolvedValueOnce(500); // still has 500 s remaining
      const fetcher = jest.fn();

      const result = await service.rememberWithStaleFallback('key', fetcher);

      expect(result).toEqual({ cached: true });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call fetcher when TTL has expired (remainingTtl = 0)', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ stale: true }));
      mockTtl.mockResolvedValueOnce(0); // expired
      const fetcher = jest.fn().mockResolvedValue({ fresh: true });

      const result = await service.rememberWithStaleFallback('key', fetcher, 300);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ fresh: true });
    });

    it('should call fetcher on a full cache miss and cache the result', async () => {
      mockGet.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockResolvedValue({ computed: true });

      const result = await service.rememberWithStaleFallback('key', fetcher, 300);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ computed: true });
      expect(mockSetex).toHaveBeenCalledWith('key', 300, JSON.stringify({ computed: true }));
    });

    it('should return the stale cached value when the fetcher fails (stale-while-error)', async () => {
      // First get: return stale data; TTL is 0 (so we try to refresh)
      mockGet.mockResolvedValueOnce(JSON.stringify({ stale: 'data' }));
      mockTtl.mockResolvedValueOnce(0);
      const fetcher = jest.fn().mockRejectedValue(new Error('upstream down'));

      const result = await service.rememberWithStaleFallback('key', fetcher);

      expect(result).toEqual({ stale: 'data' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should re-throw when the fetcher fails and there is no cached value at all', async () => {
      mockGet.mockResolvedValueOnce(null);
      const fetcher = jest.fn().mockRejectedValue(new Error('upstream down'));

      await expect(service.rememberWithStaleFallback('key', fetcher)).rejects.toThrow(
        'upstream down',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // mget / mset
  // ──────────────────────────────────────────────────────────────────────────
  describe('mget', () => {
    it('should return deserialised values for found keys and null for missing ones', async () => {
      mockMget.mockResolvedValueOnce([JSON.stringify('a'), null, JSON.stringify('c')]);
      const result = await service.mget<string>(['k1', 'k2', 'k3']);
      expect(result).toEqual(['a', null, 'c']);
    });

    it('should return an array of nulls on Redis error', async () => {
      mockMget.mockRejectedValueOnce(new Error('mget failed'));
      const result = await service.mget(['k1', 'k2']);
      expect(result).toEqual([null, null]);
    });
  });

  describe('mset', () => {
    it('should serialise key-value pairs and call redis.mset', async () => {
      await service.mset({ 'k1': 'v1', 'k2': { n: 2 } });

      expect(mockMsetRedis).toHaveBeenCalledWith(
        'k1', JSON.stringify('v1'),
        'k2', JSON.stringify({ n: 2 }),
      );
    });

    it('should set TTL for each key via a pipeline when TTL is provided', async () => {
      await service.mset({ 'k1': 'v1', 'k2': 'v2' }, 120);

      expect(mockPipeline).toHaveBeenCalledTimes(1);
      expect(mockPipelineExpire).toHaveBeenCalledWith('k1', 120);
      expect(mockPipelineExpire).toHaveBeenCalledWith('k2', 120);
      expect(mockPipelineExec).toHaveBeenCalledTimes(1);
    });

    it('should not use a pipeline when no TTL is provided', async () => {
      await service.mset({ 'k1': 'v1' });
      expect(mockPipeline).not.toHaveBeenCalled();
    });

    it('should re-throw on Redis error', async () => {
      mockMsetRedis.mockRejectedValueOnce(new Error('mset failed'));
      await expect(service.mset({ k: 'v' })).rejects.toThrow('mset failed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getOrComputeLeaderboard / invalidateLeaderboardCache
  // ──────────────────────────────────────────────────────────────────────────
  describe('getOrComputeLeaderboard', () => {
    it('should return the cached leaderboard on a cache hit', async () => {
      const board = [{ rank: 1, user: 'alice' }];
      mockGet.mockResolvedValueOnce(JSON.stringify(board));
      const computeFn = jest.fn();

      const result = await service.getOrComputeLeaderboard('board:global', computeFn);

      expect(result).toEqual(board);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('should call computeFn, cache the result, and return it on a cache miss', async () => {
      mockGet.mockResolvedValueOnce(null);
      const board = [{ rank: 1, user: 'bob' }];
      const computeFn = jest.fn().mockResolvedValue(board);

      const result = await service.getOrComputeLeaderboard('board:global', computeFn, 60);

      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(result).toEqual(board);
      expect(mockSetex).toHaveBeenCalledWith(
        'board:global',
        60,
        JSON.stringify(board),
      );
    });
  });

  describe('invalidateLeaderboardCache', () => {
    it('should call clearPattern with the default "leaderboard:*" pattern', async () => {
      mockKeys.mockResolvedValueOnce(['leaderboard:global', 'leaderboard:monthly']);
      mockDel.mockResolvedValueOnce(2);

      const count = await service.invalidateLeaderboardCache();

      expect(mockKeys).toHaveBeenCalledWith('leaderboard:*');
      expect(count).toBe(2);
    });

    it('should accept a custom pattern', async () => {
      mockKeys.mockResolvedValueOnce(['custom:1']);
      mockDel.mockResolvedValueOnce(1);

      await service.invalidateLeaderboardCache('custom:*');

      expect(mockKeys).toHaveBeenCalledWith('custom:*');
    });
  });
});
