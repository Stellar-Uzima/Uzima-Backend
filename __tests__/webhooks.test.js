// Set required env vars BEFORE any imports that might use them
process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.FLUTTERWAVE_WEBHOOK_SECRET = 'flw_test_secret';
process.env.MONGODB_URI_TEST = 'mongodb://localhost:27017/uzima_test';
// Suppress console logs during tests to keep output clean
console.log = () => {};
console.warn = () => {};
console.error = () => {};

import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { vi } from 'vitest';

// Mock IORedis
vi.mock('ioredis', () => {
  return {
    default: class Redis {
      constructor() {}
      on() {}
      connect() {}
      status() {
        return 'ready';
      }
      duplicate() {
        return this;
      }
    },
  };
});

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getJobCounts: vi.fn().mockResolvedValue({}),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
  })),
}));

// Mock webhookProcessingQueue specifically to spy on addWebhookJob
vi.mock('../src/queues/webhookProcessingQueue.js', () => ({
  addWebhookJob: vi.fn(),
  webhookProcessingQueue: {
    add: vi.fn(),
  },
}));

import WebhookLog from '../src/models/WebhookLog.js';
import { addWebhookJob } from '../src/queues/webhookProcessingQueue.js';

// Dynamic import of app must happen after mocks and env vars
let app;

describe('Webhook System', () => {
  beforeAll(async () => {
    // Import app dynamically
    const mod = await import('../src/index.js');
    app = mod.default;

    // Connect to test database if not already connected by app
    if (mongoose.connection.readyState === 0) {
      // Mock mongoose connect if needed or use in-memory mongo
      // For now assume local mongo or mock entire mongoose
      // But we need models to work.
      // If app connects, we are good.
      // app calls connectDB().
    }
  });

  afterAll(async () => {
    // await mongoose.connection.close(); // app might handle this or we just exit
  });

  afterEach(async () => {
    // Check if connected before deleting
    if (mongoose.connection.readyState !== 0) {
      await WebhookLog.deleteMany({});
    }
    vi.clearAllMocks();
  });

  describe('Stripe Webhooks', () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    it('should reject requests with missing signature', async () => {
      const res = await request(app).post('/webhooks/stripe').send({ type: 'payment.succeeded' });

      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid signature', async () => {
      const payload = JSON.stringify({ type: 'payment.succeeded' });
      const signature = 't=' + Math.floor(Date.now() / 1000) + ',v1=invalid_sig';

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('Stripe-Signature', signature)
        .send(payload); // Raw body capture middleware relies on buffer. Supertest sends string/json.
      // We might need to ensure supertest sends raw buffer or proper Content-Type so express.json handles it?
      // express.json handles application/json.

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid signature', async () => {
      const payload = { type: 'payment.succeeded', id: 'evt_123' };
      const payloadString = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);

      const toSign = `${timestamp}.${payloadString}`;
      const signature = crypto.createHmac('sha256', secret).update(toSign).digest('hex');

      const header = `t=${timestamp},v1=${signature}`;

      const res = await request(app)
        .post('/webhooks/stripe')
        .set('Stripe-Signature', header)
        .send(payload);

      expect(res.status).toBe(200);
      expect(addWebhookJob).toHaveBeenCalled();

      // Verify DB Log
      // Since we mocked redis, app started successfully (hopefully).
      // We are writing to REAL MongoDB if connected.
      // The test assumes local mongo is available (MONGODB_URI_TEST).
      // If not, this might fail or timeout.
      // Ideally should mock mongoose too if avoiding DB.
      // But requirement said "Verify implementation with tests".

      const log = await WebhookLog.findOne({ 'payload.id': 'evt_123' });
      expect(log).toBeTruthy();
      expect(log.source).toBe('stripe');
      expect(log.status).toBe('pending');
    });
  });

  describe('Flutterwave Webhooks', () => {
    const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

    it('should reject requests with invalid signature', async () => {
      const res = await request(app)
        .post('/webhooks/flutterwave')
        .set('verif-hash', 'wrong_secret')
        .send({ event: 'charge.completed' });

      expect(res.status).toBe(401);
    });

    it('should accept requests with valid signature', async () => {
      const res = await request(app)
        .post('/webhooks/flutterwave')
        .set('verif-hash', secret)
        .send({ event: 'charge.completed', data: { id: 123 } });

      expect(res.status).toBe(200);
      expect(addWebhookJob).toHaveBeenCalled();

      const log = await WebhookLog.findOne({ 'payload.data.id': 123 });
      expect(log).toBeTruthy();
      expect(log.source).toBe('flutterwave');
    });
  });
});
