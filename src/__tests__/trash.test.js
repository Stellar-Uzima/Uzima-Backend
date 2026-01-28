/**
 * Tests for the Trash Controller
 * Tests the trash management endpoints
 */
import request from 'supertest';
import app from '../index.js';
import User from '../models/User.js';
import Record from '../models/Record.js';
import Prescription from '../models/Prescription.js';
import jwt from 'jsonwebtoken';

// Helper to create an admin auth token
const createAdminToken = userId => {
  return jwt.sign({ id: userId, role: 'admin' }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '1h',
  });
};

describe('Trash Controller', () => {
  let adminUser;
  let authToken;
  let testRecord;
  let testPrescription;

  beforeAll(async () => {
    // Create an admin user for authentication
    adminUser = await User.create({
      username: 'trash_test_admin',
      email: 'trash_admin@test.com',
      password: 'TestPass123!',
      role: 'admin',
    });
    authToken = createAdminToken(adminUser._id);
  });

  afterAll(async () => {
    // Clean up
    await User.deleteMany({ email: /trash.*@test\.com/ });
    await Record.deleteMany({ patientName: /Trash Test/ });
    await Prescription.deleteMany({ patientName: /Trash Test/ });
  });

  beforeEach(async () => {
    // Create test data
    testRecord = await Record.create({
      patientName: 'Trash Test Patient',
      diagnosis: 'Test diagnosis',
      treatment: 'Test treatment',
      txHash: `tx-${Date.now()}-${Math.random()}`,
      clientUUID: `uuid-${Date.now()}-${Math.random()}`,
      syncTimestamp: new Date(),
      createdBy: adminUser._id,
    });

    // Soft delete the record
    testRecord.deletedAt = new Date();
    testRecord.deletedBy = adminUser._id;
    await testRecord.save();
  });

  afterEach(async () => {
    // Clean up after each test
    await Record.deleteMany({ patientName: /Trash Test/ });
  });

  describe('GET /api/admin/trash', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/admin/trash').expect(401);
    });

    it('should return trash items for authenticated admin', async () => {
      const res = await request(app)
        .get('/api/admin/trash')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('should filter by resourceType', async () => {
      const res = await request(app)
        .get('/api/admin/trash?resourceType=record')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.resourceType).toBe('record');
      // All returned items should be records
      res.body.data.items.forEach(item => {
        expect(item._resourceType).toBe('record');
      });
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/admin/trash?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(5);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/admin/trash/stats', () => {
    it('should return trash statistics', async () => {
      const res = await request(app)
        .get('/api/admin/trash/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalItems');
      expect(res.body.data).toHaveProperty('byResourceType');
      expect(res.body.data).toHaveProperty('itemsDueForPurge');
      expect(typeof res.body.data.totalItems).toBe('number');
    });

    it('should include counts by resource type', async () => {
      const res = await request(app)
        .get('/api/admin/trash/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const byType = res.body.data.byResourceType;
      expect(byType).toHaveProperty('record');
      expect(byType.record).toHaveProperty('count');
      expect(byType.record).toHaveProperty('displayName');
    });
  });

  describe('GET /api/admin/trash/types', () => {
    it('should return available resource types', async () => {
      const res = await request(app)
        .get('/api/admin/trash/types')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.types)).toBe(true);

      // Should include common types
      const typeKeys = res.body.data.types.map(t => t.key);
      expect(typeKeys).toContain('user');
      expect(typeKeys).toContain('record');
      expect(typeKeys).toContain('prescription');
    });
  });

  describe('POST /api/admin/trash/restore/:resourceType/:id', () => {
    it('should restore a soft-deleted item', async () => {
      const res = await request(app)
        .post(`/api/admin/trash/restore/record/${testRecord._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify the record was restored
      const restored = await Record.findById(testRecord._id);
      expect(restored).not.toBeNull();
      expect(restored.deletedAt).toBeNull();
    });

    it('should return 404 for non-existent item', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/admin/trash/restore/record/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for unknown resource type', async () => {
      const res = await request(app)
        .post(`/api/admin/trash/restore/unknown/${testRecord._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/admin/trash/:resourceType/:id', () => {
    it('should permanently delete an item from trash', async () => {
      const res = await request(app)
        .delete(`/api/admin/trash/record/${testRecord._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify the record was permanently deleted
      const deleted = await Record.findById(testRecord._id).setOptions({ includeDeleted: true });
      expect(deleted).toBeNull();
    });

    it('should return 404 for item not in trash', async () => {
      // Create an active (not deleted) record
      const activeRecord = await Record.create({
        patientName: 'Trash Test Active',
        diagnosis: 'Test',
        treatment: 'Test',
        txHash: `tx-active-${Date.now()}`,
        clientUUID: `uuid-active-${Date.now()}`,
        syncTimestamp: new Date(),
        createdBy: adminUser._id,
      });

      const res = await request(app)
        .delete(`/api/admin/trash/record/${activeRecord._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);

      // Clean up
      await activeRecord.deleteOne();
    });
  });

  describe('DELETE /api/admin/trash/empty', () => {
    it('should empty all trash items', async () => {
      // Create multiple deleted records
      for (let i = 0; i < 3; i++) {
        const record = await Record.create({
          patientName: `Trash Test Empty ${i}`,
          diagnosis: 'Test',
          treatment: 'Test',
          txHash: `tx-empty-${Date.now()}-${i}`,
          clientUUID: `uuid-empty-${Date.now()}-${i}`,
          syncTimestamp: new Date(),
          createdBy: adminUser._id,
          deletedAt: new Date(),
        });
      }

      const res = await request(app)
        .delete('/api/admin/trash/empty?resourceType=record')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalDeleted');
      expect(res.body.data.totalDeleted).toBeGreaterThan(0);
    });

    it('should filter by resource type', async () => {
      const res = await request(app)
        .delete('/api/admin/trash/empty?resourceType=record')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.deletedByType).toHaveProperty('record');
    });
  });
});
