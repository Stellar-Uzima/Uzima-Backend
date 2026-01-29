import { Worker } from 'bullmq';
import { URL } from 'url';
import connectDB from '../config/database.js';
import WebhookLog from '../models/WebhookLog.js';

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

async function processWebhookJob(job) {
    const { logId, source, event, payload } = job.data;

    if (!logId) {
        throw new Error('Missing logId in job data');
    }

    try {
        // 1. Find the log entry
        const log = await WebhookLog.findById(logId);
        if (!log) {
            throw new Error(`WebhookLog ${logId} not found`);
        }

        // 2. Update status to processing
        log.status = 'processed'; // Assuming successful processing for now. In real app, we'd call business logic here.
        log.processingId = job.id;
        // Increment attempts handled by BullMQ, but we store it too if needed or rely on BullMQ
        log.attempts = job.attemptsMade + 1;

        // TODO: Dispatch to actual business logic handlers based on source/event
        // e.g. if (source === 'stripe' && event === 'payment_intent.succeeded') { ... }

        await log.save();

        return { status: 'success', logId };
    } catch (error) {
        // Update log with error
        await WebhookLog.findByIdAndUpdate(logId, {
            status: 'failed',
            errorMessage: error.message,
            attempts: job.attemptsMade + 1
        });
        throw error;
    }
}

// Initialize worker
connectDB().then(() => {
    const worker = new Worker(queueName, processWebhookJob, {
        connection,
        concurrency: 5,
    });

    worker.on('completed', (job) => {
        console.log(`Webhook processing completed for log ${job.data.logId}`);
    });

    worker.on('failed', (job, err) => {
        console.error(`Webhook processing failed for log ${job.data?.logId}: ${err.message}`);
    });

    console.log('Incoming Webhook Processing Worker initialized');
});
