import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendEmail } from '../services/notificationService.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

/**
 * Email worker to process email notifications from the queue
 */
export const emailWorker = new Worker(
  'email-notifications',
  async (job) => {
    const { to, subject, html, text, notificationId, type } = job.data;

    console.log(`Processing email job ${job.id} for ${to} (type: ${type})`);

    try {
      const result = await sendEmail({
        to,
        subject,
        html,
        text,
        notificationId,
      });

      return result;
    } catch (error) {
      console.error(`Email job ${job.id} failed:`, error.message);
      
      // Throw error to trigger retry mechanism
      throw error;
    }
  },
  {
    connection,
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY || 5),
    limiter: {
      max: Number(process.env.EMAIL_RATE_LIMIT_MAX || 10),
      duration: Number(process.env.EMAIL_RATE_LIMIT_DURATION || 1000),
    },
  }
);

// Worker event handlers
emailWorker.on('completed', (job, result) => {
  console.log(`✓ Email job ${job.id} completed successfully (${result.provider})`);
});

emailWorker.on('failed', (job, error) => {
  console.error(`✗ Email job ${job?.id} failed after ${job?.attemptsMade} attempts:`, error.message);
  
  // Check if max attempts reached
  const maxAttempts = job?.opts?.attempts || 3;
  if (job?.attemptsMade >= maxAttempts) {
    console.error(`✗ Email job ${job?.id} permanently failed after ${maxAttempts} attempts`);
  }
});

emailWorker.on('error', (error) => {
  console.error('Email worker error:', error);
});

emailWorker.on('stalled', (jobId) => {
  console.warn(`Email job ${jobId} has stalled`);
});

emailWorker.on('active', (job) => {
  console.log(`Email job ${job.id} is now active (attempt ${job.attemptsMade + 1})`);
});

console.log('Email worker started and listening for jobs...');

export default emailWorker;
