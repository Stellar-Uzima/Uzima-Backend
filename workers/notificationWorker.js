#!/usr/bin/env node

import notificationWorkerService from './workers/index.js';
import { logger } from './utils/logger.js';
import { getConfig } from './config/index.js';

/**
 * Notification Worker CLI Entry Point
 * 
 * Usage:
 *   node workers/notificationWorker.js [options]
 * 
 * Options:
 *   --email-concurrency <number>  Email worker concurrency (default: 5)
 *   --push-concurrency <number>  Push worker concurrency (default: 10)
 *   --env <string>           Environment (default: development)
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    emailConcurrency: 5,
    pushConcurrency: 10,
    env: process.env.NODE_ENV || 'development',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--email-concurrency':
        options.emailConcurrency = parseInt(args[++i]) || 5;
        break;
      case '--push-concurrency':
        options.pushConcurrency = parseInt(args[++i]) || 10;
        break;
      case '--env':
        options.env = args[++i] || 'development';
        break;
      case '--help':
      case '-h':
        console.log(`
Notification Worker Service

Usage: node workers/notificationWorker.js [options]

Options:
  --email-concurrency <number>  Email worker concurrency (default: 5)
  --push-concurrency <number>  Push worker concurrency (default: 10)
  --env <string>           Environment (default: development)
  --help, -h              Show this help message

Examples:
  node workers/notificationWorker.js
  node workers/notificationWorker.js --email-concurrency 10 --push-concurrency 20
  node workers/notificationWorker.js --env production
        `);
        process.exit(0);
    }
  }

  return options;
}

async function main() {
  try {
    const options = parseArgs();
    
    // Set environment if provided
    if (options.env !== process.env.NODE_ENV) {
      process.env.NODE_ENV = options.env;
    }

    logger.info('🚀 Starting Notification Worker Service', {
      environment: options.env,
      emailConcurrency: options.emailConcurrency,
      pushConcurrency: options.pushConcurrency,
      pid: process.pid,
    });

    // Load configuration
    const config = getConfig();
    logger.info('Configuration loaded', {
      nodeEnv: config.nodeEnv,
      logLevel: config.logLevel,
      redis: config.redis ? 'configured' : 'not configured',
    });

    // Start the worker service
    await notificationWorkerService.start({
      emailConcurrency: options.emailConcurrency,
      pushConcurrency: options.pushConcurrency,
    });

    logger.info('✅ Notification Worker Service is running');
    logger.info('Press Ctrl+C to stop');

    // Keep the process alive
    setInterval(async () => {
      const health = await notificationWorkerService.healthCheck();
      if (health.status !== 'healthy') {
        logger.error('Worker health check failed', health);
      }
    }, 30000); // Health check every 30 seconds

  } catch (error) {
    logger.error('Failed to start notification worker service', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Handle top-level errors
main().catch(error => {
  logger.error('Fatal error in notification worker service', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
