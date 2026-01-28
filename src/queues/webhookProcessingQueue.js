import { Queue } from 'bullmq';
import { URL } from 'url';

const queueName = 'webhook-processing-queue';

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

export const webhookProcessingQueue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs for inspection
    }
});

export const addWebhookJob = async (data) => {
    return webhookProcessingQueue.add('process-webhook', data);
};

export default {
    queue: webhookProcessingQueue,
    add: addWebhookJob,
};
