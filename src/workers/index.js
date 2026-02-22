import { createEmailWorker, createPushWorker, getNotificationQueueStats, shutdownWorkers } from './notificationWorker.js';
import { logger } from '../utils/logger.js';

/**
 * Notification Worker Service
 * 
 * This service runs background workers for processing email and push notifications.
 * It handles retries with exponential backoff and tracks delivery status.
 */

class NotificationWorkerService {
  constructor() {
    this.emailWorker = null;
    this.pushWorker = null;
    this.isRunning = false;
    this.shutdownInProgress = false;
  }

  /**
   * Start the notification workers
   * @param {Object} options - Worker options
   * @param {number} options.emailConcurrency - Email worker concurrency
   * @param {number} options.pushConcurrency - Push worker concurrency
   */
  async start(options = {}) {
    if (this.isRunning) {
      logger.warn('Notification workers are already running');
      return;
    }

    const {
      emailConcurrency = 5,
      pushConcurrency = 10,
    } = options;

    try {
      logger.info('Starting notification workers...', {
        emailConcurrency,
        pushConcurrency,
      });

      // Create and start workers
      this.emailWorker = createEmailWorker(emailConcurrency);
      this.pushWorker = createPushWorker(pushConcurrency);

      // Wait for workers to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.isRunning = true;
      logger.info('✅ Notification workers started successfully');

      // Log initial queue stats
      const stats = await getNotificationQueueStats();
      logger.info('Initial queue statistics', stats);

    } catch (error) {
      logger.error('Failed to start notification workers', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop the notification workers gracefully
   */
  async stop() {
    if (!this.isRunning || this.shutdownInProgress) {
      logger.warn('Workers are not running or shutdown already in progress');
      return;
    }

    this.shutdownInProgress = true;
    logger.info('Stopping notification workers...');

    try {
      await shutdownWorkers();
      this.isRunning = false;
      this.shutdownInProgress = false;
      logger.info('✅ Notification workers stopped successfully');
    } catch (error) {
      logger.error('Error during worker shutdown', { error: error.message });
      this.shutdownInProgress = false;
      throw error;
    }
  }

  /**
   * Get worker status
   * @returns {Object} Worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      shutdownInProgress: this.shutdownInProgress,
      hasEmailWorker: !!this.emailWorker,
      hasPushWorker: !!this.pushWorker,
    };
  }

  /**
   * Health check for workers
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const stats = await getNotificationQueueStats();
      const status = this.getStatus();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        workers: status,
        queues: stats,
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        workers: this.getStatus(),
      };
    }
  }
}

// Create singleton instance
const notificationWorkerService = new NotificationWorkerService();

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down notification workers...');
  await notificationWorkerService.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down notification workers...');
  await notificationWorkerService.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception in notification worker', { error: error.message, stack: error.stack });
  await notificationWorkerService.stop();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled promise rejection in notification worker', { reason, promise });
  await notificationWorkerService.stop();
  process.exit(1);
});

export default notificationWorkerService;
