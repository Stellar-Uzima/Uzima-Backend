import { createClient } from 'redis';
import { getConfig } from './index.js';

/**
 * Redis client configuration using unified config loader.
 * Config is validated on load, so we can assume redis.url is always present.
 */
const createRedisClient = () => {
  const { redis } = getConfig();

  return createClient({
    url: redis.url,
    socket: {
      reconnectStrategy: retries => {
        if (retries > 10) {
          // End reconnecting with built in error
          return new Error('Redis reconnection attempts exhausted');
        }
        // Reconnect after exponential backoff
        return Math.min(retries * 100, 3000);
      },
    },
  });
};

const redisClient = createRedisClient();

// Handle Redis connection events
redisClient.on('error', err => {
  // eslint-disable-next-line no-console
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  // eslint-disable-next-line no-console
  console.log('Redis Client Connected');
});

redisClient.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log('Redis Client Ready');
});

redisClient.on('end', () => {
  // eslint-disable-next-line no-console
  console.log('Redis Client Disconnected');
});

// Connect to Redis
const connectRedis = async () => {
  try {
    await redisClient.connect();
    // eslint-disable-next-line no-console
    console.log('Connected to Redis successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to Redis:', error);
    // In production, you might want to exit the process
    // process.exit(1);
  }
};

export const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
  }
};

// Initialize Redis connection
connectRedis();

export default redisClient;
