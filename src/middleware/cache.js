import redisClient from '../config/redis.js';

// Cache metrics tracking
const cacheMetrics = {
  hits: 0,
  misses: 0,
  errors: 0,
  stampedePrevented: 0,
};

/**
 * Get current cache metrics
 * @returns {Object} Cache metrics (hits, misses, errors, stampedePrevented, hitRate)
 */
export function getCacheMetrics() {
  const total = cacheMetrics.hits + cacheMetrics.misses;
  return {
    ...cacheMetrics,
    hitRate: total > 0 ? ((cacheMetrics.hits / total) * 100).toFixed(2) + '%' : '0%',
    total,
  };
}

/**
 * Reset cache metrics (useful for testing)
 */
export function resetCacheMetrics() {
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
  cacheMetrics.errors = 0;
  cacheMetrics.stampedePrevented = 0;
}

/**
 * Generate cache key from request
 * @param {string} prefix - Cache key prefix (e.g., 'search', 'stats')
 * @param {Object} req - Express request object
 * @param {Array<string>} queryParams - Query params to include in key
 * @returns {string} Cache key
 */
export function generateCacheKey(prefix, req, queryParams = []) {
  const parts = [prefix, req.path];

  queryParams.forEach(param => {
    if (req.query[param] !== undefined) {
      parts.push(`${param}:${req.query[param]}`);
    }
  });

  return parts.join(':');
}

/**
 * Acquire a lock for cache stampede protection
 * @param {string} lockKey - Lock key
 * @param {number} lockTTL - Lock TTL in seconds
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireLock(lockKey, lockTTL = 10) {
  try {
    const result = await redisClient.set(lockKey, '1', {
      NX: true, // Only set if not exists
      EX: lockTTL, // Expire after lockTTL seconds
    });
    return result === 'OK';
  } catch (error) {
    console.error('Cache lock error:', error);
    return false;
  }
}

/**
 * Release a lock
 * @param {string} lockKey - Lock key
 */
async function releaseLock(lockKey) {
  try {
    await redisClient.del(lockKey);
  } catch (error) {
    console.error('Cache unlock error:', error);
  }
}

/**
 * Wait for cached data with polling (used when another request is computing)
 * @param {string} cacheKey - Cache key to wait for
 * @param {number} maxWait - Max wait time in ms
 * @param {number} pollInterval - Poll interval in ms
 * @returns {Promise<string|null>} Cached data or null
 */
async function waitForCache(cacheKey, maxWait = 5000, pollInterval = 100) {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return cached;
    }
    // eslint-disable-next-line no-undef
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return null;
}

/**
 * Cache middleware factory with stampede protection
 * @param {Object} options - Cache options
 * @param {string} options.prefix - Cache key prefix
 * @param {number} options.ttl - TTL in seconds (default: 60)
 * @param {Array<string>} options.queryParams - Query params to include in cache key
 * @param {Function} options.keyGenerator - Custom key generator (optional)
 * @returns {Function} Express middleware
 */
export function cacheMiddleware(options = {}) {
  const { prefix = 'cache', ttl = 60, queryParams = [], keyGenerator = null } = options;

  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if Redis is connected
    if (!redisClient.isReady) {
      console.warn('Redis not ready, skipping cache');
      return next();
    }

    const cacheKey = keyGenerator ? keyGenerator(req) : generateCacheKey(prefix, req, queryParams);
    const lockKey = `lock:${cacheKey}`;

    try {
      // Try to get from cache first
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        cacheMetrics.hits++;
        console.log(`Cache HIT: ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }

      cacheMetrics.misses++;
      console.log(`Cache MISS: ${cacheKey}`);

      // Try to acquire lock (stampede protection)
      const lockAcquired = await acquireLock(lockKey, Math.min(ttl, 30));

      if (!lockAcquired) {
        // Another request is computing, wait for cache
        cacheMetrics.stampedePrevented++;
        console.log(`Cache STAMPEDE PREVENTED: ${cacheKey}`);

        const waitedCache = await waitForCache(cacheKey, 5000);
        if (waitedCache) {
          cacheMetrics.hits++;
          return res.json(JSON.parse(waitedCache));
        }

        // Timeout waiting, proceed without cache
        return next();
      }

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = async data => {
        try {
          // Cache the response
          await redisClient.set(cacheKey, JSON.stringify(data), { EX: ttl });
          console.log(`Cache SET: ${cacheKey} (TTL: ${ttl}s)`);
        } catch (error) {
          console.error('Cache set error:', error);
          cacheMetrics.errors++;
        } finally {
          // Always release lock
          await releaseLock(lockKey);
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      cacheMetrics.errors++;
      next();
    }
  };
}

/**
 * Invalidate cache by key pattern
 * @param {string} pattern - Key pattern (e.g., 'search:*', 'stats:*')
 * @returns {Promise<number>} Number of keys deleted
 */
export async function invalidateCache(pattern) {
  try {
    if (!redisClient.isReady) {
      console.warn('Redis not ready, cannot invalidate cache');
      return 0;
    }

    const keys = await redisClient.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    console.log(`Cache INVALIDATED: ${pattern} (${deleted} keys)`);
    return deleted;
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return 0;
  }
}

/**
 * Invalidate specific cache key
 * @param {string} key - Cache key to invalidate
 * @returns {Promise<boolean>} True if key was deleted
 */
export async function invalidateCacheKey(key) {
  try {
    if (!redisClient.isReady) {
      return false;
    }

    const result = await redisClient.del(key);
    if (result > 0) {
      console.log(`Cache KEY INVALIDATED: ${key}`);
    }
    return result > 0;
  } catch (error) {
    console.error('Cache key invalidation error:', error);
    return false;
  }
}

/**
 * Cache invalidation hook factory - creates middleware that invalidates cache after mutations
 * @param {string|Array<string>} patterns - Pattern(s) to invalidate
 * @returns {Function} Express middleware
 */
export function cacheInvalidationHook(patterns) {
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];

  return async (req, res, next) => {
    // Store original end function
    const originalEnd = res.end.bind(res);

    res.end = async function (...args) {
      // Only invalidate on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        for (const pattern of patternArray) {
          await invalidateCache(pattern);
        }
      }
      return originalEnd(...args);
    };

    next();
  };
}

export default {
  cacheMiddleware,
  invalidateCache,
  invalidateCacheKey,
  cacheInvalidationHook,
  generateCacheKey,
  getCacheMetrics,
  resetCacheMetrics,
};
