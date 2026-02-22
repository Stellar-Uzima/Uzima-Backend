import { Queue, Worker } from 'bullmq';
import { createClient } from 'redis';
import { URL } from 'url';
import { sendEmail } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';
import Notification from '../models/Notification.js';

// Redis connection configuration
function parseRedisUrl(urlString) {
  const u = new URL(urlString || 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname ? Number(u.pathname.replace('/', '')) || 0 : 0,
  };
}

const connection = parseRedisUrl(process.env.REDIS_URL);

// Notification Queues
const emailQueue = new Queue('notification-email', { connection });
const pushQueue = new Queue('notification-push', { connection });

// Queue configuration
const queueOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // Start with 2 seconds
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 50, // Keep last 50 failed jobs
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

/**
 * Add email notification to queue
 * @param {Object} jobData - Email job data
 * @param {string} jobData.notificationId - Notification ID
 * @param {string} jobData.to - Recipient email
 * @param {string} jobData.subject - Email subject
 * @param {string} jobData.html - HTML content
 * @param {string} jobData.text - Text content
 * @param {string} jobData.type - Notification type
 * @param {string} jobData.userId - User ID
 * @param {number} jobData.priority - Job priority (1-10)
 */
export async function enqueueEmailNotification(jobData, priority = 5) {
  return emailQueue.add('send-email', jobData, {
    ...queueOptions,
    priority,
    jobId: `email-${jobData.notificationId}`,
  });
}

/**
 * Add push notification to queue
 * @param {Object} jobData - Push job data
 * @param {string} jobData.notificationId - Notification ID
 * @param {string} jobData.userId - User ID
 * @param {string} jobData.title - Notification title
 * @param {string} jobData.message - Notification message
 * @param {Object} jobData.data - Additional data
 * @param {number} jobData.priority - Job priority (1-10)
 */
export async function enqueuePushNotification(jobData, priority = 5) {
  return pushQueue.add('send-push', jobData, {
    ...queueOptions,
    priority,
    jobId: `push-${jobData.notificationId}`,
  });
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt) {
  const baseDelay = 2000; // 2 seconds
  const maxDelay = 300000; // 5 minutes max
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return Math.floor(delay + jitter);
}

/**
 * Update notification status in database
 * @param {string} notificationId - Notification ID
 * @param {string} status - New status
 * @param {Object} metadata - Additional metadata
 */
async function updateNotificationStatus(notificationId, status, metadata = {}) {
  try {
    await Notification.findByIdAndUpdate(notificationId, {
      $set: {
        status,
        updatedAt: new Date(),
        ...(status === 'sent' && { sentAt: new Date() }),
        ...(status === 'failed' && { failedAt: new Date() }),
        ...(Object.keys(metadata).length > 0 && {
          'metadata': { $merge: metadata }
        }),
      },
    });
  } catch (error) {
    logger.error('Failed to update notification status:', {
      notificationId,
      status,
      error: error.message,
    });
  }
}

/**
 * Process email notification job
 * @param {Object} job - BullMQ job
 */
async function processEmailJob(job) {
  const { notificationId, to, subject, html, text, type, userId } = job.data;
  
  logger.info('Processing email notification job', {
    notificationId,
    to,
    subject,
    type,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Update notification status to processing
    await updateNotificationStatus(notificationId, 'retrying', {
      attempts: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });

    // Send email using notification service
    const result = await sendEmail({
      to,
      subject,
      html,
      text,
      notificationId,
    });

    logger.info('Email sent successfully', {
      notificationId,
      to,
      messageId: result.messageId,
      provider: result.provider,
    });

    return result;
  } catch (error) {
    logger.error('Email job failed', {
      notificationId,
      to,
      error: error.message,
      attempt: job.attemptsMade + 1,
    });

    // Update notification with error
    await updateNotificationStatus(notificationId, 'failed', {
      errorMessage: error.message,
      errorCode: error.code || 'SEND_FAILED',
      attempts: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });

    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Process push notification job
 * @param {Object} job - BullMQ job
 */
async function processPushJob(job) {
  const { notificationId, userId, title, message, data } = job.data;
  
  logger.info('Processing push notification job', {
    notificationId,
    userId,
    title,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Update notification status to processing
    await updateNotificationStatus(notificationId, 'retrying', {
      attempts: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });

    // Send push notification (implement based on your push service)
    const result = await sendPushNotification({
      userId,
      title,
      message,
      data,
      notificationId,
    });

    logger.info('Push notification sent successfully', {
      notificationId,
      userId,
      result,
    });

    return result;
  } catch (error) {
    logger.error('Push job failed', {
      notificationId,
      userId,
      error: error.message,
      attempt: job.attemptsMade + 1,
    });

    // Update notification with error
    await updateNotificationStatus(notificationId, 'failed', {
      errorMessage: error.message,
      errorCode: error.code || 'PUSH_FAILED',
      attempts: job.attemptsMade + 1,
      lastAttemptAt: new Date(),
    });

    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Send push notification (placeholder implementation)
 * @param {Object} pushData - Push notification data
 * @returns {Promise<Object>} Send result
 */
async function sendPushNotification(pushData) {
  // This is a placeholder implementation
  // Replace with your actual push notification service (Firebase, OneSignal, etc.)
  
  const { userId, title, message, data } = pushData;
  
  logger.info('Sending push notification', {
    userId,
    title,
    message,
    data,
  });

  // Simulate push service call
  // In real implementation, you would use:
  // - Firebase Cloud Messaging
  // - OneSignal
  // - Apple Push Notification Service
  // - Google Cloud Messaging
  
  return {
    success: true,
    provider: 'push_service',
    messageId: `push_${Date.now()}_${userId}`,
  };
}

/**
 * Create email queue worker
 * @param {string} concurrency - Number of concurrent jobs
 */
export function createEmailWorker(concurrency = 5) {
  const worker = new Worker(
    'notification-email',
    processEmailJob,
    {
      connection,
      concurrency,
      ...queueOptions,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Email job completed', {
      jobId: job.id,
      notificationId: job.data.notificationId,
    });
    
    // Update final status
    updateNotificationStatus(job.data.notificationId, 'sent', {
      completedAt: new Date(),
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('Email job failed permanently', {
      jobId: job.id,
      notificationId: job.data.notificationId,
      error: err.message,
      attemptsMade: job.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Email worker error', { error: err.message });
  });

  return worker;
}

/**
 * Create push notification worker
 * @param {string} concurrency - Number of concurrent jobs
 */
export function createPushWorker(concurrency = 10) {
  const worker = new Worker(
    'notification-push',
    processPushJob,
    {
      connection,
      concurrency,
      ...queueOptions,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Push job completed', {
      jobId: job.id,
      notificationId: job.data.notificationId,
    });
    
    // Update final status
    updateNotificationStatus(job.data.notificationId, 'sent', {
      completedAt: new Date(),
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('Push job failed permanently', {
      jobId: job.id,
      notificationId: job.data.notificationId,
      error: err.message,
      attemptsMade: job.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Push worker error', { error: err.message });
  });

  return worker;
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue stats
 */
export async function getNotificationQueueStats() {
  const [emailStats, pushStats] = await Promise.all([
    emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    pushQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
  ]);

  return {
    email: {
      waiting: emailStats.waiting || 0,
      active: emailStats.active || 0,
      completed: emailStats.completed || 0,
      failed: emailStats.failed || 0,
      delayed: emailStats.delayed || 0,
    },
    push: {
      waiting: pushStats.waiting || 0,
      active: pushStats.active || 0,
      completed: pushStats.completed || 0,
      failed: pushStats.failed || 0,
      delayed: pushStats.delayed || 0,
    },
  };
}

/**
 * Pause queues
 */
export async function pauseQueues() {
  await Promise.all([
    emailQueue.pause(),
    pushQueue.pause(),
  ]);
  logger.info('Notification queues paused');
}

/**
 * Resume queues
 */
export async function resumeQueues() {
  await Promise.all([
    emailQueue.resume(),
    pushQueue.resume(),
  ]);
  logger.info('Notification queues resumed');
}

/**
 * Graceful shutdown
 */
export async function shutdownWorkers() {
  logger.info('Shutting down notification workers...');
  
  await Promise.all([
    emailQueue.close(),
    pushQueue.close(),
  ]);
  
  logger.info('Notification workers shut down');
}

export default {
  enqueueEmailNotification,
  enqueuePushNotification,
  createEmailWorker,
  createPushWorker,
  getNotificationQueueStats,
  pauseQueues,
  resumeQueues,
  shutdownWorkers,
  emailQueue,
  pushQueue,
};
