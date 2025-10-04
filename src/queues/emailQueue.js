import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const emailQueue = new Queue('email-notifications', {
  connection,
  defaultJobOptions: {
    attempts: Number(process.env.EMAIL_MAX_ATTEMPTS || 3),
    backoff: {
      type: 'exponential',
      delay: Number(process.env.EMAIL_BACKOFF_DELAY || 2000),
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep completed jobs for 24 hours
    },
    removeOnFail: false, // Keep failed jobs for debugging
  },
});

/**
 * Add an email job to the queue
 * @param {Object} emailData - Email data
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.text - Plain text content
 * @param {string} emailData.type - Notification type
 * @param {string} emailData.userId - User ID (optional)
 * @param {string} emailData.notificationId - Notification document ID
 * @returns {Promise<Job>}
 */
export async function enqueueEmail(emailData) {
  const job = await emailQueue.add('send-email', emailData, {
    jobId: emailData.notificationId, // Use notification ID as job ID for idempotency
  });
  
  console.log(`Email job queued: ${job.id} for ${emailData.to}`);
  return job;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

export default emailQueue;
