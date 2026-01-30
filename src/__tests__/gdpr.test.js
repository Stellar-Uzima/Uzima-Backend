import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';
import Record from '../models/Record.js';
import GDPRRequest from '../models/GDPRRequest.js';
import transactionLog from '../models/transactionLog.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('GDPR Compliance Endpoints', () => {
  let testUser;
  let testAdmin;
  let testRecord;
  let userToken;
  let adminToken;
  let testUserId;
  let testAdminId;

  beforeAll(async () => {
    // Create test users
    const hashedPassword = await bcrypt.hash('testpassword123', 10);

    testUser = new User({
      username: 'testuser',
      email: 'testuser@example.com',
      password: hashedPassword,
      role: 'patient',
    });
    await testUser.save();
    testUserId = testUser._id;

    testAdmin = new User({
      username: 'testadmin',
      email: 'testadmin@example.com',
      password: hashedPassword,
      role: 'admin',
    });
    await testAdmin.save();
    testAdminId = testAdmin._id;

    // Create test record
    testRecord = new Record({
      patientName: 'John Doe',
      date: new Date(),
      diagnosis: 'Test Diagnosis',
      treatment: 'Test Treatment',
      txHash: 'test-hash-123',
      clientUUID: 'test-uuid-123',
      syncTimestamp: new Date(),
      createdBy: testUserId,
    });
    await testRecord.save();

    // Generate JWT tokens
    userToken = jwt.sign({ id: testUserId, role: 'patient' }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '1h',
    });

    adminToken = jwt.sign({ id: testAdminId, role: 'admin' }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $in: ['testuser@example.com', 'testadmin@example.com'] } });
    await Record.deleteMany({ clientUUID: 'test-uuid-123' });
    await GDPRRequest.deleteMany({ userId: { $in: [testUserId, testAdminId] } });
    await transactionLog.deleteMany({ userId: testUserId.toString() });

    // Clean up export files
    const exportsDir = path.join(__dirname, '../exports');
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir);
      files.forEach(file => {
        if (file.startsWith('user-data-export-')) {
          fs.unlinkSync(path.join(exportsDir, file));
        }
      });
    }

    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up GDPR requests before each test
    await GDPRRequest.deleteMany({});
  });

  describe('POST /api/users/:id/export-data', () => {
    it('should export user data in JSON format', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}/export-data?format=json`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBeDefined();
      expect(response.body.data.status).toBe('processing');
      expect(response.body.data.estimatedCompletion).toBe('5-10 minutes');

      // Verify GDPR request was created
      const gdprRequest = await GDPRRequest.findOne({ userId: testUserId, requestType: 'export' });
      expect(gdprRequest).toBeTruthy();
      expect(gdprRequest.exportFormat).toBe('json');
      expect(gdprRequest.status).toBe('processing');
    });

    it('should export user data in CSV format', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}/export-data?format=csv`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBeDefined();
      expect(response.body.data.status).toBe('processing');

      // Verify GDPR request was created
      const gdprRequest = await GDPRRequest.findOne({ userId: testUserId, requestType: 'export' });
      expect(gdprRequest.exportFormat).toBe('csv');
    });

    it('should allow admin to export any user data', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}/export-data`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBeDefined();
    });

    it('should deny access to other users data', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'otheruser@example.com',
        password: 'hashedpassword',
        role: 'patient',
      });
      await otherUser.save();

      const otherUserToken = jwt.sign(
        { id: otherUser._id, role: 'patient' },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/api/users/${testUserId}/export-data`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Insufficient permissions');

      await User.findByIdAndDelete(otherUser._id);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/users/${fakeUserId}/export-data`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('User not found');
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/users/${testUserId}/export-data`).expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Unauthorized');
    });
  });

  describe('GET /api/users/:id/export-status/:requestId', () => {
    it('should return export status for valid request', async () => {
      // Create a GDPR request
      const gdprRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'export',
        requestedBy: testUserId,
        exportFormat: 'json',
        status: 'completed',
        requestReason: 'Test export',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await gdprRequest.save();

      const response = await request(app)
        .get(`/api/users/${testUserId}/export-status/${gdprRequest._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBe(gdprRequest._id.toString());
      expect(response.body.data.status).toBe('completed');
    });

    it('should return 404 for non-existent request', async () => {
      const fakeRequestId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/users/${testUserId}/export-status/${fakeRequestId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Export request not found');
    });
  });

  describe('DELETE /api/users/:id/erase', () => {
    it('should request user data deletion', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/erase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'Test deletion request' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBeDefined();
      expect(response.body.data.status).toBe('processing');
      expect(response.body.data.message).toContain('Data deletion request submitted');

      // Verify GDPR request was created
      const gdprRequest = await GDPRRequest.findOne({ userId: testUserId, requestType: 'delete' });
      expect(gdprRequest).toBeTruthy();
      expect(gdprRequest.requestReason).toBe('Test deletion request');
    });

    it('should allow admin to delete any user data', async () => {
      const response = await request(app)
        .delete(`/api/users/${testUserId}/erase`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Admin deletion request' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deny access to other users data', async () => {
      const otherUser = new User({
        username: 'otheruser2',
        email: 'otheruser2@example.com',
        password: 'hashedpassword',
        role: 'patient',
      });
      await otherUser.save();

      const otherUserToken = jwt.sign(
        { id: otherUser._id, role: 'patient' },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .delete(`/api/users/${testUserId}/erase`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Insufficient permissions');

      await User.findByIdAndDelete(otherUser._id);
    });

    it('should prevent duplicate deletion requests', async () => {
      // Create first deletion request
      await request(app)
        .delete(`/api/users/${testUserId}/erase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'First deletion request' })
        .expect(200);

      // Try to create second deletion request
      const response = await request(app)
        .delete(`/api/users/${testUserId}/erase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'Second deletion request' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Deletion request already pending');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/users/${fakeUserId}/erase`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('User not found');
    });
  });

  describe('GET /api/users/:id/deletion-status/:requestId', () => {
    it('should return deletion status for valid request', async () => {
      // Create a GDPR request
      const gdprRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'delete',
        requestedBy: testUserId,
        status: 'completed',
        requestReason: 'Test deletion',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await gdprRequest.save();

      const response = await request(app)
        .get(`/api/users/${testUserId}/deletion-status/${gdprRequest._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBe(gdprRequest._id.toString());
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.deletionScheduledAt).toBeDefined();
    });

    it('should return 404 for non-existent request', async () => {
      const fakeRequestId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/users/${testUserId}/deletion-status/${fakeRequestId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Deletion request not found');
    });
  });

  describe('GET /api/admin/gdpr-requests', () => {
    it('should return all GDPR requests for admin', async () => {
      // Create test GDPR requests
      const exportRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'export',
        requestedBy: testUserId,
        status: 'completed',
        requestReason: 'Test export',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await exportRequest.save();

      const deleteRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'delete',
        requestedBy: testUserId,
        status: 'pending',
        requestReason: 'Test deletion',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await deleteRequest.save();

      const response = await request(app)
        .get('/api/admin/gdpr-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(2);
      expect(response.body.data.pagination.total).toBe(2);
    });

    it('should filter requests by status', async () => {
      // Create test requests with different statuses
      const completedRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'export',
        requestedBy: testUserId,
        status: 'completed',
        requestReason: 'Test',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await completedRequest.save();

      const pendingRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'delete',
        requestedBy: testUserId,
        status: 'pending',
        requestReason: 'Test',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await pendingRequest.save();

      const response = await request(app)
        .get('/api/admin/gdpr-requests?status=completed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].status).toBe('completed');
    });

    it('should filter requests by type', async () => {
      const response = await request(app)
        .get('/api/admin/gdpr-requests?requestType=export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should only return export requests
      response.body.data.requests.forEach(request => {
        expect(request.requestType).toBe('export');
      });
    });

    it('should require admin permissions', async () => {
      const response = await request(app)
        .get('/api/admin/gdpr-requests')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Forbidden');
    });
  });

  describe('GET /api/admin/gdpr-requests/:requestId', () => {
    it('should return GDPR request details for admin', async () => {
      const gdprRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'export',
        requestedBy: testUserId,
        status: 'completed',
        requestReason: 'Test export',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await gdprRequest.save();

      const response = await request(app)
        .get(`/api/admin/gdpr-requests/${gdprRequest._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(gdprRequest._id.toString());
      expect(response.body.data.requestType).toBe('export');
      expect(response.body.data.status).toBe('completed');
    });

    it('should return 404 for non-existent request', async () => {
      const fakeRequestId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/admin/gdpr-requests/${fakeRequestId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('GDPR request not found');
    });

    it('should require admin permissions', async () => {
      const gdprRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'export',
        requestedBy: testUserId,
        status: 'completed',
        requestReason: 'Test',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await gdprRequest.save();

      const response = await request(app)
        .get(`/api/admin/gdpr-requests/${gdprRequest._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Forbidden');
    });
  });

  describe('Audit Logging', () => {
    it('should log export requests', async () => {
      await request(app)
        .get(`/api/users/${testUserId}/export-data`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // Check if audit log was created
      const auditLog = await transactionLog.findOne({
        action: 'gdpr_export_requested',
        resource: 'user',
        resourceId: testUserId.toString(),
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog.performedBy).toBe(testUserId.toString());
      expect(auditLog.details).toContain('Data export requested');
    });

    it('should log deletion requests', async () => {
      await request(app)
        .delete(`/api/users/${testUserId}/erase`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ reason: 'Test deletion' })
        .expect(200);

      // Check if audit log was created
      const auditLog = await transactionLog.findOne({
        action: 'gdpr_deletion_requested',
        resource: 'user',
        resourceId: testUserId.toString(),
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog.performedBy).toBe(testUserId.toString());
      expect(auditLog.details).toContain('Data deletion requested');
    });
  });

  describe('Data Export Content', () => {
    it('should include all user-related data in export', async () => {
      // Create additional test data
      const additionalRecord = new Record({
        patientName: 'Jane Doe',
        date: new Date(),
        diagnosis: 'Another Diagnosis',
        treatment: 'Another Treatment',
        txHash: 'test-hash-456',
        clientUUID: 'test-uuid-456',
        syncTimestamp: new Date(),
        createdBy: testUserId,
      });
      await additionalRecord.save();

      // Create a GDPR request and manually trigger export
      const gdprRequest = new GDPRRequest({
        userId: testUserId,
        requestType: 'export',
        requestedBy: testUserId,
        exportFormat: 'json',
        status: 'processing',
        requestReason: 'Test export',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await gdprRequest.save();

      // Import and run export function
      const { exportUserData } = await import('../jobs/gdprJobs.js');
      await exportUserData(gdprRequest._id);

      // Check if export was completed
      const updatedRequest = await GDPRRequest.findById(gdprRequest._id);
      expect(updatedRequest.status).toBe('completed');
      expect(updatedRequest.exportData).toBeTruthy();
      expect(updatedRequest.downloadUrl).toBeTruthy();

      // Verify export data structure
      const exportData = updatedRequest.exportData;
      expect(exportData.user.id).toBe(testUserId.toString());
      expect(exportData.user.username).toBe('testuser');
      expect(exportData.user.email).toBe('testuser@example.com');
      expect(exportData.records).toHaveLength(2); // Original + additional record
      expect(exportData.exportMetadata.totalRecords).toBe(2);

      // Clean up
      await Record.findByIdAndDelete(additionalRecord._id);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid user ID format', async () => {
      const response = await request(app)
        .get('/api/users/invalid-id/export-data')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle missing authorization header', async () => {
      const response = await request(app).get(`/api/users/${testUserId}/export-data`).expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Unauthorized');
    });

    it('should handle invalid JWT token', async () => {
      const response = await request(app)
        .get(`/api/users/${testUserId}/export-data`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid token');
    });
  });
});
