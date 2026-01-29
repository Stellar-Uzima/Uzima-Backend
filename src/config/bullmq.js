import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Parses a Redis URL into a connection object for BullMQ.
 * @param {string} urlString - Redis connection URL.
 * @returns {object} - Connection options for BullMQ.
 */
function parseRedisUrl(urlString) {
  try {
    const u = new URL(urlString || 'redis://localhost:6379');

    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password || undefined,
      db: u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0,
    };
  } catch (error) {
    console.error('Failed to parse Redis URL:', error);

    return {
      host: 'localhost',
      port: 6379,
    };
  }
}

export const connection = parseRedisUrl(process.env.REDIS_URL);

export default {
  connection,
};
