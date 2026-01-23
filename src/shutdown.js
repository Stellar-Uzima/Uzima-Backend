import mongoose from 'mongoose';
import { closeRedis } from './config/redis.js';
import eventManager from './services/eventManager.js';

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 * Closes all connections and stops accepting new requests
 */
export const gracefulShutdown = async (server, signal) => {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Set a timeout - force exit after 30 seconds
  const forceExitTimer = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);

  try {
    // Step 1: Shutdown event manager (SSE connections)
    console.log('Shutting down SSE event manager...');
    eventManager.shutdown();
    console.log('SSE event manager shut down');

    // Step 2: Stop accepting new requests
    console.log('Closing server to new connections...');
    await new Promise((resolve, reject) => {
      server.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('Server closed to new connections');

    // Step 3: Close database connections
    console.log('Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('MongoDB connection closed');

    // Step 4: Close Redis connection
    console.log('Closing Redis connection...');
    await closeRedis();
    console.log('Redis connection closed');

    // Step 5: Clean up timers and exit successfully
    clearTimeout(forceExitTimer);
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};
