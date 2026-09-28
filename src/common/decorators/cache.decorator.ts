import { SetMetadata } from '@nestjs/common';
import { CACHE_TTL } from '../../shared/cache/cache.service';

export const CACHE_KEY_METADATA = 'cacheKey';
export const CACHE_TTL_METADATA = 'cacheTtl';
export const CACHE_INVALIDATE_METADATA = 'cacheInvalidate';

/**
 * Decorator to cache the result of a method or endpoint.
 * 
 * @param key - Cache key template. Can include dynamic values like :id, :userId
 * @param ttl - Time to live in seconds. Defaults to CACHE_TTL.DEFAULT (3600s)
 * 
 * @example
 * @Cache('user:profile:{userId}', CACHE_TTL.MEDIUM)
 * async getProfile(userId: string) { ... }
 */
export const Cache = (key: string, ttl?: number) => 
  SetMetadata(CACHE_KEY_METADATA, { key, ttl: ttl || CACHE_TTL.DEFAULT });

/**
 * Decorator to invalidate cache keys when a method is called.
 * Supports pattern-based invalidation.
 * 
 * @param patterns - Array of cache key patterns to invalidate. Supports wildcards (*)
 * 
 * @example
 * @CacheInvalidate(['user:profile:{userId}', 'user:*'])
 * async updateProfile(userId: string, data: any) { ... }
 */
export const CacheInvalidate = (patterns: string[]) => 
  SetMetadata(CACHE_INVALIDATE_METADATA, patterns);
