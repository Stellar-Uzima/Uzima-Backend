import request from 'supertest';
import app from '../index.js';
import mongoose from 'mongoose';
import ActivityLog from '../models/ActivityLog.js';

describe('Anonymization API Integration', () => {
  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Optional: specific setup or cleanup if needed
    // For unit testing controllers w/o mocking, ideally we use a test DB.
    // Assuming the setup allows running these tests.
  });

  // Mock ActivityLog.logActivity to avoid polluting DB or needing full DB setup if testing in isolation.
  // However, for integration we usually want real behavior.
  // If no DB is running this might fail. We should check if tests run against a mock DB (e.g. valid-mongodb-memory-server).
  // `src/__tests__/setup.js` usually handles this.

  test('POST /api/anonymize should anonymize data', async () => {
    const payload = {
      data: { name: 'John Doe', email: 'john@example.com', sensitive: 'secret' },
      config: {
        fieldsToAnonymize: ['email'],
        fieldsToRedact: ['sensitive'],
      },
    };

    const res = await request(app).post('/api/anonymize').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('John Doe');
    expect(res.body.data.email).not.toBe('john@example.com');
    expect(res.body.data.sensitive).toMatch(/\*+cret/);
  });

  test('POST /api/anonymize should support reversible anonymization', async () => {
    const payload = {
      data: [{ id: 1, phone: '555-0100' }],
      config: {
        fieldsToAnonymize: ['phone'],
        reversible: true,
      },
    };

    const res = await request(app).post('/api/anonymize').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.mapping).toBeDefined();

    // Verify mapping
    const hashedPhone = res.body.data[0].phone;
    expect(res.body.mapping[hashedPhone]).toBe('555-0100');
  });

  test('POST /api/anonymize should return 400 if data is missing', async () => {
    const res = await request(app).post('/api/anonymize').send({ config: {} });

    expect(res.status).toBe(400);
  });
});
