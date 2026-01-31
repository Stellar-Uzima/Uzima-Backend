import mongoose from 'mongoose';
import { getConfig } from './index.js';
import { connectWithRetry } from '../services/connectionRetry.js';
import { initializePoolMonitor } from '../utils/mongoPoolMonitor.js';

/**
 * Connect to MongoDB using configuration from the unified config loader.
 * Implements exponential backoff retry logic for connection initialization.
 * Initializes pool monitoring for metrics and diagnostics.
 * Config is validated on load, so we can assume db.uri is always present.
 */
const connectDB = async () => {
  const { db } = getConfig();

  try {
    // Use retry logic with exponential backoff
    await connectWithRetry(
      db.uri,
      db.options,
      db.pool.connectionRetryMaxAttempts,
      db.pool.connectionRetryInitialDelay
    );
    
    // Initialize pool monitoring
    initializePoolMonitor();
    
    // eslint-disable-next-line no-console
    console.log('MongoDB connection pool configured:');
    // eslint-disable-next-line no-console
    console.log(`  Max Pool Size: ${db.options.maxPoolSize}`);
    // eslint-disable-next-line no-console
    console.log(`  Min Pool Size: ${db.options.minPoolSize}`);
    // eslint-disable-next-line no-console
    console.log(`  Max Idle Time: ${db.options.maxIdleTimeMS}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Connect Timeout: ${db.options.connectTimeoutMS}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Socket Timeout: ${db.options.socketTimeoutMS}ms`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
};

export default connectDB;
