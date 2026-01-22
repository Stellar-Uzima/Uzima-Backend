// Stub email queue for prescription verification system
import pkg from 'bullmq';
const { Queue } = pkg;
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
const emailQueue = new Queue(queueName, { connection });
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