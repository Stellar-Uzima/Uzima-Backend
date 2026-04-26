import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
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
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly configService: ConfigService) {}

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
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.redis.on('reconnecting', () => {
      this.logger.log('Redis reconnecting...');
    });

    await this.redis.connect();
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {},
  ): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      const ttl = options.ttl || this.configService.get<number>('CACHE_DEFAULT_TTL', 3600);

      if (ttl > 0) {
        await this.redis.setex(key, ttl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }

      this.logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Failed to set cache key ${key}:`, error);
      throw error;
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
    } catch (error) {
      this.logger.error(`Failed to get cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to delete cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to check cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to set TTL for cache key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Failed to get TTL for cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to increment cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to decrement cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to lpush cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to lrange cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to sadd cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to smembers cache key ${key}:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to clear cache pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      this.logger.error(`Failed to get keys for pattern ${pattern}:`, error);
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
    } catch (error) {
      this.logger.error('Failed to flush cache:', error);
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
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
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
   * Cache wrapper function with automatic TTL
   */
  async remember<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 3600,
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, fetch the data
      const data = await fetcher();
      
      // Store in cache
      await this.set(key, data, { ttl });
      
      return data;
    } catch (error) {
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
      
      return values.map((value, index) => {
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
    } catch (error) {
      this.logger.error(`Failed to mget cache keys:`, error);
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
    } catch (error) {
      this.logger.error(`Failed to mset cache:`, error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    }
  }
}
