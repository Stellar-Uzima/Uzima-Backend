// Stub email queue for prescription verification system
import pkg from 'bullmq';
const { Queue, QueueScheduler } = pkg;
import { URL } from 'url';

const queueName = 'email-queue';

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
const scheduler = new QueueScheduler(queueName, { connection });
const emailQueue = new Queue(queueName, { connection });

export async function enqueueEmail(data) {
  return emailQueue.add('send-email', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function getQueueStats() {
  const counts = await emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

export default {
  add: enqueueEmail,
  getStats: getQueueStats,
  queue: emailQueue,
};
