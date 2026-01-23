import { Worker } from 'bullmq';
import { URL } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import connectDB from '../config/database.js';
import WebhookSubscription from '../models/WebhookSubscription.js';
import WebhookDelivery from '../models/WebhookDelivery.js';

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

function computeSignature(secret, payload) {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function processJob(job) {
  const { deliveryId } = job.data || {};
  if (!deliveryId) throw new Error('Missing deliveryId');

  const delivery = await WebhookDelivery.findById(deliveryId);
  if (!delivery) throw new Error(`Delivery ${deliveryId} not found`);

  const subscription = await WebhookSubscription.findById(delivery.subscriptionId);
  if (!subscription || !subscription.isActive) throw new Error('Subscription inactive or missing');

  delivery.status = 'processing';
  delivery.attempts = (delivery.attempts || 0) + 1;
  await delivery.save();

  const signature = computeSignature(subscription.secret, delivery.payload);
  delivery.signature = signature;
  await delivery.save();

  const headers = {
    'Content-Type': 'application/json',
    'X-Uzima-Signature': signature,
    'X-Uzima-Event': delivery.eventType,
    'X-Uzima-Delivery-Id': delivery._id.toString(),
  };

  try {
    const res = await axios.post(subscription.url, delivery.payload, { headers, timeout: 30000 });
    delivery.status = 'delivered';
    delivery.responseCode = res.status;
    delivery.responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    await delivery.save();
    return { status: res.status };
  } catch (err) {
    delivery.status = 'failed';
    delivery.lastError = err.message;
    delivery.responseCode = err.response?.status;
    delivery.responseBody = err.response?.data ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) : undefined;
    await delivery.save();
    throw err;
  }
}

connectDB().then(() => {
  const worker = new Worker('webhook-queue', processJob, {
    connection,
    concurrency: 5,
    settings: {
      backoffStrategies: {
        webhook: (attemptsMade) => {
          if (attemptsMade <= 0) return 0; // first run immediate
          if (attemptsMade === 1) return 60_000; // 1 min
          return 600_000; // 10 min
        },
      },
    },
  });

  worker.on('completed', (job) => {
    console.log(`Webhook delivered for ${job?.data?.deliveryId}`);
  });
  worker.on('failed', (job, err) => {
    console.error(`Webhook failed for ${job?.data?.deliveryId}: ${err.message}`);
  });
});