import redisClient from '../config/redis.js';

// Default TTL: 15 minutes (in seconds)
const DEFAULT_TTL = 900;

/**
 * Cache helper for analytics data
 */
export const cacheHelper = {
  /**
   * Get data from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached data or null
   */
  async get(key) {
    try {
      if (!redisClient || !redisClient.isOpen) {
        return null;
      }

      const data = await redisClient.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  /**
   * Set data in cache
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, data, ttl = DEFAULT_TTL) {
    try {
      if (!redisClient || !redisClient.isOpen) {
        return false;
      }

      await redisClient.set(key, JSON.stringify(data), {
        EX: ttl,
      });

      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  },

  /**
   * Generate a standardized cache key for analytics
   * @param {string} endpoint - Endpoint name (e.g., 'users', 'activity')
   * @param {object} params - Query parameters (startDate, endDate, etc.)
   * @returns {string} - Cache key
   */
  generateKey(endpoint, params = {}) {
    // Sort keys to ensure consistent cache keys regardless of param order
    const sortedParamKeys = Object.keys(params).sort();

    // Create a simplified query string for the key
    const queryString = sortedParamKeys
      .map(key => {
        const value = params[key];
        // Handle dates specifically to ensure consistency
        if (value instanceof Date) {
          return `${key}:${value.toISOString()}`;
        }
        return `${key}:${value}`;
      })
      .join('|');

    // Create a hash-like string (simple concatenation is fine for this purpose)
    // Format: analytics:{endpoint}:{paramsHash}
    return `analytics:${endpoint}:${queryString}`;
  },

  /**
   * Clear cache for a specific pattern
   * @param {string} pattern - Key pattern to delete (e.g., 'analytics:users:*')
   */
  async clearPattern(pattern) {
    try {
      if (!redisClient || !redisClient.isOpen) {
        return;
      }

      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  },
};

export default cacheHelper;
