import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { activityLogger } from '../middleware/activityLogger.js';
import activityLogService from '../services/activityLogService.js';

describe('Activity Logging System', () => {
  let server;
  let testUser, adminUser, doctorUser;
  let userToken, adminToken, doctorToken;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/uzima_test');
    }
    
    server = app.listen(0); // Use random available port
  });

  afterAll(async () => {
    await server.close();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await ActivityLog.deleteMany({});

    // Create test users
    const hashedPassword = await bcrypt.hash('password123', 10);

    testUser = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword,
      role: 'patient'
    });

    adminUser = await User.create({
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin'
    });

    doctorUser = await User.create({
      username: 'doctor',
      email: 'doctor@example.com',
      password: hashedPassword,
      role: 'doctor'
    });

    // Generate tokens
    userToken = jwt.sign(
      { id: testUser._id, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    doctorToken = jwt.sign(
      { id: doctorUser._id, role: doctorUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('ActivityLog Model', () => {
    test('should create activity log with required fields', async () => {
      const logData = {
        userId: testUser._id,
        action: 'login',
        metadata: { loginMethod: 'email' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const activityLog = await ActivityLog.create(logData);

      expect(activityLog.userId.toString()).toBe(testUser._id.toString());
      expect(activityLog.action).toBe('login');
      expect(activityLog.metadata.loginMethod).toBe('email');
      expect(activityLog.ipAddress).toBe('127.0.0.1');
      expect(activityLog.userAgent).toBe('test-agent');
      expect(activityLog.timestamp).toBeDefined();
    });

    test('should auto-expire logs after TTL period', async () => {
      const logData = {
        userId: testUser._id,
        action: 'test_action',
        expiresAt: new Date(Date.now() + 1000) // 1 second from now
      };

      const activityLog = await ActivityLog.create(logData);
      expect(activityLog.expiresAt).toBeDefined();
    });

    test('should sanitize metadata on save', async () => {
      const logData = {
        userId: testUser._id,
        action: 'test_action',
        metadata: {
          password: 'secret123',
          token: 'jwt-token',
          normalField: 'value'
        }
      };

      const activityLog = await ActivityLog.create(logData);
      expect(activityLog.metadata.password).toBe('[REDACTED]');
      expect(activityLog.metadata.token).toBe('[REDACTED]');
      expect(activityLog.metadata.normalField).toBe('value');
    });

    test('should calculate age virtual field', async () => {
      const activityLog = await ActivityLog.create({
        userId: testUser._id,
        action: 'test_action',
        timestamp: new Date(Date.now() - 60000) // 1 minute ago
      });

      expect(activityLog.age).toBeGreaterThan(50000); // Should be around 60000ms
    });

    test('should format timestamp virtual field', async () => {
      const activityLog = await ActivityLog.create({
        userId: testUser._id,
        action: 'test_action'
      });

      expect(activityLog.formattedTimestamp).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    test('should add metadata using instance method', async () => {
      const activityLog = await ActivityLog.create({
        userId: testUser._id,
        action: 'test_action',
        metadata: { existing: 'value' }
      });

      activityLog.addMetadata({ newField: 'newValue' });
      await activityLog.save();

      expect(activityLog.metadata.existing).toBe('value');
      expect(activityLog.metadata.newField).toBe('newValue');
    });
  });

  describe('Activity Logger Middleware', () => {
    test('should log activity when middleware is used', async () => {
      const mockReq = {
        user: { _id: testUser._id },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
        method: 'POST',
        originalUrl: '/api/test',
        body: { testField: 'value' }
      };

      const mockRes = {
        statusCode: 200,
        locals: {}
      };

      const mockNext = jest.fn();

      const middleware = activityLogger({ action: 'test_action' });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // Check if activity was logged
      const logs = await ActivityLog.find({ userId: testUser._id });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('test_action');
      expect(logs[0].ipAddress).toBe('127.0.0.1');
      expect(logs[0].userAgent).toBe('test-agent');
    });

    test('should skip logging for excluded paths', async () => {
      const mockReq = {
        user: { _id: testUser._id },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
        method: 'GET',
        originalUrl: '/health'
      };

      const mockRes = { statusCode: 200, locals: {} };
      const mockNext = jest.fn();

      const middleware = activityLogger({
        action: 'test_action',
        excludePaths: ['/health']
      });

      await middleware(mockReq, mockRes, mockNext);

      const logs = await ActivityLog.find({ userId: testUser._id });
      expect(logs).toHaveLength(0);
    });

    test('should handle missing user gracefully', async () => {
      const mockReq = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
        method: 'GET',
        originalUrl: '/api/test'
      };

      const mockRes = { statusCode: 200, locals: {} };
      const mockNext = jest.fn();

      const middleware = activityLogger({ action: 'test_action' });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      
      const logs = await ActivityLog.find({});
      expect(logs).toHaveLength(0);
    });
  });

  describe('Activity Log Service', () => {
    beforeEach(async () => {
      // Create some test activity logs
      await ActivityLog.create([
        {
          userId: testUser._id,
          action: 'login',
          metadata: { method: 'email' },
          timestamp: new Date(Date.now() - 86400000) // 1 day ago
        },
        {
          userId: testUser._id,
          action: 'view_record',
          metadata: { recordId: 'record123' },
          timestamp: new Date(Date.now() - 3600000) // 1 hour ago
        },
        {
          userId: adminUser._id,
          action: 'delete_user',
          metadata: { deletedUserId: 'user123' },
          timestamp: new Date()
        }
      ]);
    });

    test('should log activity using service', async () => {
      await activityLogService.logActivity({
        userId: testUser._id,
        action: 'test_service_action',
        metadata: { test: 'data' },
        ipAddress: '192.168.1.1'
      });

      const logs = await ActivityLog.find({ 
        userId: testUser._id, 
        action: 'test_service_action' 
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].metadata.test).toBe('data');
      expect(logs[0].ipAddress).toBe('192.168.1.1');
    });

    test('should retrieve user activity logs with pagination', async () => {
      const result = await activityLogService.getUserActivityLogs(testUser._id, {
        page: 1,
        limit: 1
      });

      expect(result.logs).toHaveLength(1);
      expect(result.totalCount).toBe(2);
      expect(result.totalPages).toBe(2);
      expect(result.currentPage).toBe(1);
    });

    test('should filter activity logs by action', async () => {
      const result = await activityLogService.getUserActivityLogs(testUser._id, {
        action: 'login'
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].action).toBe('login');
    });

    test('should filter activity logs by date range', async () => {
      const startDate = new Date(Date.now() - 7200000); // 2 hours ago
      const endDate = new Date();

      const result = await activityLogService.getUserActivityLogs(testUser._id, {
        startDate,
        endDate
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].action).toBe('view_record');
    });

    test('should get user activity summary', async () => {
      const summary = await activityLogService.getUserActivitySummary(testUser._id);

      expect(summary.totalActivities).toBe(2);
      expect(summary.actionCounts.login).toBe(1);
      expect(summary.actionCounts.view_record).toBe(1);
      expect(summary.lastActivity).toBeDefined();
    });

    test('should get activity statistics', async () => {
      const stats = await activityLogService.getActivityStatistics();

      expect(stats.totalLogs).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
      expect(stats.topActions).toHaveLength(3);
    });

    test('should detect suspicious activity', async () => {
      // Create multiple failed login attempts
      await ActivityLog.create([
        {
          userId: testUser._id,
          action: 'login',
          result: 'failure',
          timestamp: new Date(Date.now() - 300000) // 5 minutes ago
        },
        {
          userId: testUser._id,
          action: 'login',
          result: 'failure',
          timestamp: new Date(Date.now() - 240000) // 4 minutes ago
        },
        {
          userId: testUser._id,
          action: 'login',
          result: 'failure',
          timestamp: new Date(Date.now() - 180000) // 3 minutes ago
        }
      ]);

      const suspicious = await activityLogService.getSuspiciousActivity();
      
      expect(suspicious.failedLogins).toHaveLength(1);
      expect(suspicious.failedLogins[0]._id.toString()).toBe(testUser._id.toString());
      expect(suspicious.failedLogins[0].count).toBe(3);
    });
  });

  describe('Activity Log API Endpoints', () => {
    beforeEach(async () => {
      // Create test activity logs
      await ActivityLog.create([
        {
          userId: testUser._id,
          action: 'login',
          metadata: { method: 'email' },
          timestamp: new Date()
        },
        {
          userId: doctorUser._id,
          action: 'view_record',
          metadata: { recordId: 'record123' },
          timestamp: new Date()
        }
      ]);
    });

    test('should get user activity logs with proper authorization', async () => {
      const response = await request(server)
        .get(`/api/activity/${testUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(1);
      expect(response.body.data.logs[0].action).toBe('login');
    });

    test('should allow admin to view any user activity logs', async () => {
      const response = await request(server)
        .get(`/api/activity/${testUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(1);
    });

    test('should deny access to other users activity logs', async () => {
      const response = await request(server)
        .get(`/api/activity/${doctorUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should get user activity summary', async () => {
      const response = await request(server)
        .get(`/api/activity/${testUser._id}/summary`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalActivities).toBe(1);
    });

    test('should get all activity logs (admin only)', async () => {
      const response = await request(server)
        .get('/api/activity')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(2);
    });

    test('should deny non-admin access to all activity logs', async () => {
      const response = await request(server)
        .get('/api/activity')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should get activity statistics (admin only)', async () => {
      const response = await request(server)
        .get('/api/activity/statistics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalLogs).toBe(2);
      expect(response.body.data.uniqueUsers).toBe(2);
    });

    test('should get suspicious activity (admin only)', async () => {
      const response = await request(server)
        .get('/api/activity/suspicious')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('failedLogins');
      expect(response.body.data).toHaveProperty('multipleIPs');
    });

    test('should handle pagination parameters', async () => {
      const response = await request(server)
        .get(`/api/activity/${testUser._id}?page=1&limit=5`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.currentPage).toBe(1);
      expect(response.body.data.totalPages).toBeDefined();
    });

    test('should handle action filter', async () => {
      const response = await request(server)
        .get(`/api/activity/${testUser._id}?action=login`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.logs).toHaveLength(1);
      expect(response.body.data.logs[0].action).toBe('login');
    });

    test('should require authentication', async () => {
      const response = await request(server)
        .get(`/api/activity/${testUser._id}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Integration with Auth Routes', () => {
    test('should log login activity', async () => {
      const response = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);

      // Check if login activity was logged
      const logs = await ActivityLog.find({ 
        userId: testUser._id, 
        action: 'login' 
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    test('should log logout activity', async () => {
      const response = await request(server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          refreshToken: 'dummy-refresh-token'
        });

      // Check if logout activity was logged (regardless of response status)
      const logs = await ActivityLog.find({ 
        userId: testUser._id, 
        action: 'logout' 
      });

      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid user ID in API', async () => {
      const response = await request(server)
        .get('/api/activity/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle database errors gracefully', async () => {
      // Mock a database error
      jest.spyOn(ActivityLog, 'find').mockRejectedValueOnce(new Error('Database error'));

      const response = await request(server)
        .get(`/api/activity/${testUser._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);

      // Restore the mock
      ActivityLog.find.mockRestore();
    });
  });
});