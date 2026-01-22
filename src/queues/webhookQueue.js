import { Queue } from 'bullmq';
import { URL } from 'url';

const queueName = 'webhook-queue';

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
// QueueScheduler is removed in BullMQ v5
const webhookQueue = new Queue(queueName, { connection });

export async function enqueueWebhook(data) {
  return webhookQueue.add('deliver-webhook', data, {
    attempts: 3,
    backoff: { type: 'webhook' },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function getQueueStats() {
  const counts = await webhookQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

export default {
  add: enqueueWebhook,
  getStats: getQueueStats,
  queue: webhookQueue,
};