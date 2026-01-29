// Stub email queue for prescription verification system
import { Queue } from 'bullmq';
import pkg from 'bullmq';

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
// QueueScheduler removed in BullMQ v5
// const scheduler = new QueueScheduler(queueName, { connection });
const emailQueue = new Queue(queueName, { connection });

export async function enqueueEmail(data) {
  return emailQueue.add('send-email', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
// Stub email queue - placeholder for missing functionality
export const emailQueue = {
  add: (data) => {
    console.log('Email queued (stub):', data);
    return Promise.resolve({ id: 'stub-job-id' });
  }
};

export const enqueueEmail = (data) => {
  console.log('Email enqueued (stub):', data);
  return Promise.resolve({ id: 'stub-job-id' });
};

export const getQueueStats = () => {
  console.log('Getting queue stats (stub)');
  return Promise.resolve({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0
  });
};

export default emailQueue;