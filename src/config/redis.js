import { createClient } from 'redis';
import { getConfig } from './index.js';

/**
 * Redis client configuration using unified config loader.
 * Config is validated on load, so we can assume redis.url is always present.
 */
const createRedisClient = () => {
  try {
    const { redis } = getConfig();
    
    if (!redis || !redis.url) {
      console.warn('Redis not configured - proceeding without Redis');
      return null;
    }

    return createClient({
      url: redis.url,
      socket: {
        reconnectStrategy: retries => {
          if (retries > 10) {
            // End reconnecting with built in error
            console.warn('Redis reconnection attempts exhausted - proceeding without Redis');
            return false; // Don't reconnect
          }
          // Reconnect after exponential backoff
          return Math.min(retries * 100, 3000);
        },
      },
    });
  } catch (error) {
    console.warn('Redis configuration error - proceeding without Redis:', error.message);
    return null;
  }
};

const redisClient = createRedisClient();

// Only connect if client exists
if (redisClient) {
  redisClient.connect().catch(err => {
    console.warn('Failed to connect to Redis - proceeding without Redis:', err.message);
  });
}

// Handle Redis connection events
if (redisClient) {
  redisClient.on('error', err => {
    // eslint-disable-next-line no-console
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('Redis Client Connected');
  });
}

if (redisClient) {
  redisClient.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log('Redis Client Ready');
  });

  redisClient.on('end', () => {
    // eslint-disable-next-line no-console
    console.log('Redis Client Disconnected');
  });
}

// Connect to Redis
const connectRedis = async () => {
  if (!redisClient) {
    console.warn('Redis client not available - skipping connection');
    return;
  }
  
  try {
    await redisClient.connect();
    // eslint-disable-next-line no-console
    console.log('Connected to Redis successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
  }
};

// Initialize Redis connection (only if not already connecting)
if (redisClient && !redisClient.isOpen) {
  connectRedis();
}

export default redisClient;
