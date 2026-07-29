import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';

/**
 * Cache TTL (Time-To-Live) constants in seconds.
 * These represent the default lifetimes for different cache categories.
 * All cache operations use these defaults unless explicitly overridden.
 */
export const CACHE_TTL = {
  /** Default TTL for general-purpose cache entries (1 hour) */
  DEFAULT: 3600,
  /** Short-lived cache for frequently changing data (5 minutes) */
  SHORT: 300,
  /** Medium-lived cache for semi-static data (30 minutes) */
  MEDIUM: 1800,
  /** Long-lived cache for rarely changing data (6 hours) */
  LONG: 21600,
  /** Leaderboard cache TTL (15 minutes) - balances freshness with performance */
  LEADERBOARD: 900,
  /** Session / auth token cache TTL (24 hours) */
  SESSION: 86400,
  /** Rate-limit window cache TTL (1 minute) */
  RATE_LIMIT: 60,
} as const;

export interface CacheOptions {
  /** Time to live in seconds. Falls back to the service-level default (CACHE_DEFAULT_TTL env var or 3600) */
  ttl?: number;
  compress?: boolean; // Whether to compress the value
}

export interface CacheStats {
  keys: number;
  memory: string;
  hits: number;
  misses: number;
  hitRate: number;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns the configured default TTL (in seconds).
   * Falls back to CACHE_TTL.DEFAULT (3600) when no env override is set.
   */
  private get defaultTtl(): number {
    return this.configService.get<number>('CACHE_DEFAULT_TTL', CACHE_TTL.DEFAULT);
  }

  async onModuleInit() {
    const config = redisConfig(this.configService);
    
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      tls: config.tls ? {} : undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    } as any);

    this.redis.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redis.on('error', (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Redis connection error: ${msg}`);
    });

    this.redis.on('reconnecting', () => {
      this.logger.log('Redis reconnecting...');
    });

    await this.redis.connect();
  }

  /**
   * Set a value in cache with TTL (Time-To-Live).
   *
   * **TTL resolution order (consistent across all cache methods):**
   * 1. `options.ttl` if explicitly provided — use it as-is; pass `0` for no expiry
   * 2. The `CACHE_DEFAULT_TTL` environment variable (if set)
   * 3. `CACHE_TTL.DEFAULT` constant (3600s / 1 hour)
   *
   * @param key     - Cache key
   * @param value   - Value to store (will be JSON-serialized)
   * @param options - Optional settings; `options.ttl` accepts seconds including 0 for no expiry
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {},
  ): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      // Use nullish coalescing so an explicit ttl of 0 means "no expiry"
      const ttl = options.ttl ?? this.defaultTtl;

      if (ttl > 0) {
        await this.redis.setex(key, ttl, serializedValue);
      } else {
        // ttl <= 0 means no automatic expiry
        await this.redis.set(key, serializedValue);
      }

      this.logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error: any) {
      this.logger.error(`Failed to set cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Atomically set a value only if the key does not already exist (NX) with TTL.
   *
   * TTL follows the same resolution order as {@link set}.
   * Returns `true` if the key was set, `false` if it already existed.
   *
   * @param key   - Cache key
   * @param value - Value to store (will be JSON-serialized)
   * @param ttl   - TTL in seconds; defaults to the service-level default TTL.
   *                Use {@link CACHE_TTL} constants for category-appropriate lifetimes.
   */
  async setIfNotExists(
    key: string,
    value: any,
    ttl?: number,
  ): Promise<boolean> {
    const effectiveTtl = ttl ?? this.defaultTtl;
    try {
      const serializedValue = JSON.stringify(value);
      // Use Redis SET with NX and EX for atomic set-if-not-exists with expiry
      const result = await this.redis.set(key, serializedValue, 'EX', effectiveTtl, 'NX');
      const wasSet = result === 'OK';
      this.logger.debug(`Cache setIfNotExists: ${key} (TTL: ${effectiveTtl}s) -> ${wasSet}`);
      return wasSet;
    } catch (error: any) {
      this.logger.error(`Failed to setIfNotExists cache key ${key}:`, error);
      // In case of error, be conservative and allow sending (return true)
      return true;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      
      if (value === null) {
        this.missCount++;
        this.logger.debug(`Cache miss: ${key}`);
        return null;
      }

      this.hitCount++;
      this.logger.debug(`Cache hit: ${key}`);
      
      return JSON.parse(value) as T;
    } catch (error: any) {
      this.logger.error(`Failed to get cache key ${key}: ${error?.message || error}`);
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug(`Cache deleted: ${key}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error: any) {
      this.logger.error(`Failed to check cache key ${key}: ${error?.message || error}`);
      return false;
    }
  }

  /**
   * Set TTL for a key
   */
  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.redis.expire(key, ttl);
      this.logger.debug(`Cache TTL set: ${key} (${ttl}s)`);
    } catch (error: any) {
      this.logger.error(`Failed to set TTL for cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error: any) {
      this.logger.error(`Failed to get TTL for cache key ${key}: ${error?.message || error}`);
      return -1;
    }
  }

  /**
   * Increment a numeric value
   */
  async incr(key: string, amount: number = 1): Promise<number> {
    try {
      const result = await this.redis.incrby(key, amount);
      this.logger.debug(`Cache incremented: ${key} by ${amount}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to increment cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Decrement a numeric value
   */
  async decr(key: string, amount: number = 1): Promise<number> {
    try {
      const result = await this.redis.decrby(key, amount);
      this.logger.debug(`Cache decremented: ${key} by ${amount}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to decrement cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Add value to a list
   */
  async lpush(key: string, ...values: any[]): Promise<number> {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      const result = await this.redis.lpush(key, ...serializedValues);
      this.logger.debug(`Cache lpush: ${key} (${values.length} items)`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to lpush cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get values from a list
   */
  async lrange<T>(key: string, start: number = 0, stop: number = -1): Promise<T[]> {
    try {
      const values = await this.redis.lrange(key, start, stop);
      return values.map(v => JSON.parse(v)) as T[];
    } catch (error: any) {
      this.logger.error(`Failed to lrange cache key ${key}: ${error?.message || error}`);
      return [];
    }
  }

  /**
   * Add value to a set
   */
  async sadd(key: string, ...values: any[]): Promise<number> {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      const result = await this.redis.sadd(key, ...serializedValues);
      this.logger.debug(`Cache sadd: ${key} (${values.length} items)`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to sadd cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get all values from a set
   */
  async smembers<T>(key: string): Promise<T[]> {
    try {
      const values = await this.redis.smembers(key);
      return values.map(v => JSON.parse(v)) as T[];
    } catch (error: any) {
      this.logger.error(`Failed to smembers cache key ${key}: ${error?.message || error}`);
      return [];
    }
  }

  /**
   * Clear cache by pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      this.logger.log(`Cache cleared: ${keys.length} keys matching pattern "${pattern}"`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to clear cache pattern ${pattern}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error: any) {
      this.logger.error(`Failed to get keys for pattern ${pattern}: ${error?.message || error}`);
      return [];
    }
  }

  /**
   * Flush all cache
   */
  async flushAll(): Promise<void> {
    try {
      await this.redis.flushall();
      this.logger.log('Cache flushed all');
    } catch (error: any) {
      this.logger.error(`Failed to flush cache: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info('memory');
      const keyCount = await this.redis.dbsize();
      
      // Parse memory usage from Redis info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memory = memoryMatch ? memoryMatch[1].trim() : '0B';

      const totalRequests = this.hitCount + this.missCount;
      const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

      return {
        keys: keyCount,
        memory,
        hits: this.hitCount,
        misses: this.missCount,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get cache stats: ${error?.message || error}`);
      return {
        keys: 0,
        memory: '0B',
        hits: this.hitCount,
        misses: this.missCount,
        hitRate: 0,
      };
    }
  }

  /**
   * Cache wrapper – return cached data or compute + cache on miss.
   *
   * TTL follows the same resolution order as {@link set}.
   *
   * @param key     - Cache key
   * @param fetcher - Async function that produces the value when not cached
   * @param ttl     - TTL override in seconds; defaults to the service-level default TTL
   */
  async remember<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const effectiveTtl = ttl ?? this.defaultTtl;
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, fetch the data
      const data = await fetcher();
      
      // Store in cache
      await this.set(key, data, { ttl: effectiveTtl });
      
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to remember cache key ${key}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Fetch with cache; on fetch failure return last cached value if present
   * (stale-while-error pattern).
   *
   * TTL follows the same resolution order as {@link set}.
   *
   * @param key     - Cache key
   * @param fetcher - Async function that produces the value on cache miss / expiry
   * @param ttl     - TTL override in seconds; defaults to the service-level default TTL
   */
  async rememberWithStaleFallback<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const effectiveTtl = ttl ?? this.defaultTtl;
    const cached = await this.get<T>(key);
    if (cached !== null) {
      const remainingTtl = await this.ttl(key);
      if (remainingTtl > 0) {
        return cached;
      }
    }

    try {
      const data = await fetcher();
      await this.set(key, data, { ttl: effectiveTtl });
      return data;
    } catch (error) {
      if (cached !== null) {
        this.logger.warn(
          `Fetcher failed for ${key}; returning stale cached value`,
        );
        return cached;
      }
      this.logger.error(`Failed to remember cache key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      
      return values.map((value) => {
        if (value === null) {
          this.missCount++;
          return null;
        }
        
        this.hitCount++;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error: any) {
      this.logger.error(`Failed to mget cache keys: ${error?.message || error}`);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    try {
      const serializedPairs: string[] = [];
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs.push(key, JSON.stringify(value));
      }

      await this.redis.mset(...serializedPairs);

      // Set TTL for all keys if provided
      if (ttl && ttl > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of Object.keys(keyValuePairs)) {
          pipeline.expire(key, ttl);
        }
        await pipeline.exec();
      }

      this.logger.debug(`Cache mset: ${Object.keys(keyValuePairs).length} keys`);
    } catch (error: any) {
      this.logger.error(`Failed to mset cache: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Get or compute leaderboard with caching.
   * Returns cached result if available, otherwise computes and caches.
   *
   * @param cacheKey  - Redis key for the leaderboard
   * @param computeFn - Async function that computes the leaderboard data
   * @param ttl       - TTL override in seconds; defaults to CACHE_TTL.LEADERBOARD (900s / 15 min)
   */
  async getOrComputeLeaderboard<T>(
    cacheKey: string,
    computeFn: () => Promise<T>,
    ttl: number = CACHE_TTL.LEADERBOARD,
  ): Promise<T> {
    try {
      const cached = await this.get<T>(cacheKey);
      if (cached !== null) {
        this.logger.debug(`Leaderboard cache hit: ${cacheKey}`);
        return cached;
      }

      this.logger.debug(`Computing leaderboard: ${cacheKey}`);
      const result = await computeFn();

      await this.set(cacheKey, result, { ttl });

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to get or compute leaderboard ${cacheKey}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Invalidate leaderboard cache by pattern
   */
  async invalidateLeaderboardCache(pattern: string = 'leaderboard:*'): Promise<number> {
    try {
      const count = await this.clearPattern(pattern);
      this.logger.log(`Invalidated ${count} leaderboard cache keys`);
      return count;
    } catch (error: any) {
      this.logger.error(`Failed to invalidate leaderboard cache: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis ping failed:', error);
      throw error;
    }
  }

  /**
   * Get Redis statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info();
      const infoLines = info.split('\r\n');
      const stats: Record<string, string> = {};
      
      infoLines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) stats[key] = value;
      });

      const keys = parseInt(stats['db0']?.split(',')[0]?.split('=')[1] || '0');
      const usedMemory = stats['used_memory_human'] || '0B';
      const hits = parseInt(stats['keyspace_hits'] || '0');
      const misses = parseInt(stats['keyspace_misses'] || '0');
      const totalRequests = hits + misses;
      const hitRate = totalRequests > 0 ? hits / totalRequests : 0;

      return {
        keys,
        memory: usedMemory,
        hits,
        misses,
        hitRate,
      };
    } catch (error) {
      this.logger.error('Failed to get Redis stats:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    }
  }
}