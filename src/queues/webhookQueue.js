import { Queue } from 'bullmq';
import { connection } from '../config/bullmq.js';

const queueName = 'webhook-queue';
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
  const counts = await webhookQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed'
  );

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
