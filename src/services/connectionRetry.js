/**
 * MongoDB Connection Retry Service
 * 
 * Implements exponential backoff retry logic for MongoDB connection initialization.
 * Handles transient connection failures with configurable retry attempts and delays.
 * 
 * @module connectionRetry
 */

import mongoose from 'mongoose';

/**
 * Identifies if an error is transient and retryable
 * @param {Error} error - The connection error
 * @returns {boolean} True if error is transient and should be retried
 */
function isTransientError(error) {
  // Network-related transient errors that should be retried
  const transientErrorPatterns = [
    'ECONNREFUSED',      // Connection refused
    'ECONNRESET',        // Connection reset
    'ETIMEDOUT',         // Connection timeout
    'EHOSTUNREACH',      // Host unreachable
    'ENETUNREACH',       // Network unreachable
    'ENOTFOUND',         // DNS lookup failed
    'EADDRINUSE',        // Address in use
    'connect ECONNREFUSED', // Connection refused message
    'no servers',        // Replica set server selection
    'topology destroyed', // Connection pool destroyed
  ];

  const errorString = error.toString().toLowerCase();
  const errorCode = error.code ? error.code.toUpperCase() : '';
  const errorMessage = error.message ? error.message.toLowerCase() : '';

  // Check if error matches any transient pattern
  const isTransient = transientErrorPatterns.some(
    pattern => 
      errorString.includes(pattern.toLowerCase()) ||
      errorCode.includes(pattern) ||
      errorMessage.includes(pattern.toLowerCase())
  );

  return isTransient;
}

/**
 * Calculates exponential backoff delay
 * @param {number} attemptNumber - Current attempt number (1-indexed)
 * @param {number} initialDelayMs - Initial delay in milliseconds
 * @returns {number} Delay in milliseconds for this attempt
 * 
 * @example
 * // Attempt 1: 1000ms
 * // Attempt 2: 2000ms
 * // Attempt 3: 4000ms
 * getBackoffDelay(2, 1000) // Returns 2000
 */
function getBackoffDelay(attemptNumber, initialDelayMs) {
  // Exponential backoff: delay = initialDelay * (2 ^ (attempt - 1))
  const exponent = Math.min(attemptNumber - 1, 5); // Cap at 5 to prevent excessive delays
  return initialDelayMs * Math.pow(2, exponent);
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Resolves after specified delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attempts to connect to MongoDB with exponential backoff retry logic
 * 
 * @param {string} uri - MongoDB connection URI
 * @param {Object} options - Mongoose connection options
 * @param {number} maxAttempts - Maximum connection attempts (default: 3)
 * @param {number} initialDelayMs - Initial backoff delay in ms (default: 1000)
 * @returns {Promise<Object>} Mongoose connection object on success
 * @throws {Error} After max attempts exceeded
 * 
 * @example
 * try {
 *   const connection = await connectWithRetry(
 *     'mongodb://localhost:27017/uzima',
 *     { maxPoolSize: 25 },
 *     3,
 *     1000
 *   );
 *   console.log('Connected successfully');
 * } catch (error) {
 *   console.error('Connection failed after retries:', error.message);
 * }
 */
export async function connectWithRetry(
  uri,
  options,
  maxAttempts = 3,
  initialDelayMs = 1000
) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // eslint-disable-next-line no-console
      console.log(`MongoDB connection attempt ${attempt}/${maxAttempts}...`);

      // Attempt connection
      const connection = await mongoose.connect(uri, options);

      // eslint-disable-next-line no-console
      console.log(
        `✅ MongoDB connected successfully on attempt ${attempt}`
      );

      return connection;
    } catch (error) {
      lastError = error;
      const isTransient = isTransientError(error);

      // eslint-disable-next-line no-console
      console.error(
        `❌ MongoDB connection failed (attempt ${attempt}/${maxAttempts}):`,
        error.message
      );

      // If this is the last attempt or error is permanent, throw
      if (attempt === maxAttempts) {
        // eslint-disable-next-line no-console
        console.error(
          `\n⚠️  Failed to connect after ${maxAttempts} attempts`
        );

        if (!isTransient) {
          // eslint-disable-next-line no-console
          console.error(
            'This appears to be a permanent error (not retrying):'
          );
          // eslint-disable-next-line no-console
          console.error(`   - Error: ${error.message}`);
          // eslint-disable-next-line no-console
          console.error(
            '   - Check MongoDB URI, credentials, and network access\n'
          );
        }

        throw error;
      }

      // If transient error and not last attempt, retry with backoff
      if (isTransient) {
        const delayMs = getBackoffDelay(attempt, initialDelayMs);
        // eslint-disable-next-line no-console
        console.log(
          `⏳ Retrying in ${delayMs}ms (transient error detected)...\n`
        );
        await sleep(delayMs);
      } else {
        // Permanent error - don't retry
        // eslint-disable-next-line no-console
        console.error(
          '⚠️  Permanent error detected, not retrying (likely authentication or URI issue)\n'
        );
        throw error;
      }
    }
  }

  // This should never be reached, but include for safety
  throw lastError || new Error('Failed to connect to MongoDB');
}

/**
 * Mongoose connection state helper
 * @returns {string} Human-readable connection state
 */
export function getConnectionState() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return states[mongoose.connection.readyState] || 'unknown';
}

/**
 * Disconnect from MongoDB gracefully
 * @returns {Promise<void>}
 */
export async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}

export default { connectWithRetry, getConnectionState, disconnect };
