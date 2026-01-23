/* eslint-disable prettier/prettier */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import Permission from '../models/Permission.js';
import User from '../models/User.js';
import permissionCache from '../services/permissionCache.js';
import jwt from 'jsonwebtoken';

describe('RBAC Integration Tests', () => {
  let adminToken, doctorToken, patientToken, educatorToken;
  let adminUser, doctorUser, patientUser, educatorUser;

  beforeAll(async () => {
    // Create test users
    adminUser = await User.create({
      username: 'admin_test',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin',
    });

    doctorUser = await User.create({
      username: 'doctor_test',
      email: 'doctor@test.com',
      password: 'password123',
      role: 'doctor',
    });

    patientUser = await User.create({
      username: 'patient_test',
      email: 'patient@test.com',
      password: 'password123',
      role: 'patient',
    });

    educatorUser = await User.create({
      username: 'educator_test',
      email: 'educator@test.com',
      password: 'password123',
      role: 'educator',
    });

    // Generate JWT tokens
    const jwtSecret = process.env.JWT_SECRET || 'test_secret';
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, jwtSecret);
    doctorToken = jwt.sign({ id: doctorUser._id, role: doctorUser.role }, jwtSecret);
    patientToken = jwt.sign({ id: patientUser._id, role: patientUser.role }, jwtSecret);
    educatorToken = jwt.sign({ id: educatorUser._id, role: educatorUser.role }, jwtSecret);
  });

  beforeEach(async () => {
    await Permission.deleteMany({});
    permissionCache.invalidate();
  });

  afterEach(() => {
    permissionCache.stopAutoRefresh();
  });

  describe('Permission CRUD Operations', () => {
    it('should allow admin to create a new permission', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'records',
          action: 'read',
          roles: ['admin', 'doctor'],
          description: 'View medical records',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.resource).toBe('records');
      expect(response.body.data.action).toBe('read');
    });

    it('should prevent non-admin from creating permissions', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          resource: 'records',
          action: 'read',
          roles: ['admin', 'doctor'],
        });

      expect(response.status).toBe(403);
    });

    it('should allow admin to view all permissions', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
      });
      await Permission.create({
        resource: 'records',
        action: 'create',
        roles: ['admin'],
      });

      const response = await request(app)
        .get('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data).toHaveLength(2);
    });

    it('should allow admin to view permissions by role', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
      });
      await Permission.create({
        resource: 'records',
        action: 'create',
        roles: ['admin'],
      });

      const response = await request(app)
        .get('/api/permissions/role/doctor')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.role).toBe('doctor');
      expect(response.body.count).toBe(1);
    });

    it('should allow admin to update a permission', async () => {
      const permission = await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin'],
      });

      const response = await request(app)
        .put(`/api/permissions/${permission._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roles: ['admin', 'doctor', 'patient'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.roles).toEqual(['admin', 'doctor', 'patient']);
    });

    it('should allow admin to delete a permission', async () => {
      const permission = await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin'],
      });

      const response = await request(app)
        .delete(`/api/permissions/${permission._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const deletedPermission = await Permission.findById(permission._id);
      expect(deletedPermission).toBeNull();
    });

    it('should prevent duplicate permissions', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin'],
      });

      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'records',
          action: 'read',
          roles: ['doctor'],
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Permission already exists');
    });
  });

  describe('Permission-Based Route Access', () => {
    beforeEach(async () => {
      // Set up permissions
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor', 'patient'],
      });
      await Permission.create({
        resource: 'records',
        action: 'create',
        roles: ['admin', 'doctor'],
      });
      await Permission.create({
        resource: 'records',
        action: 'update',
        roles: ['admin', 'doctor'],
      });
      await Permission.create({
        resource: 'records',
        action: 'delete',
        roles: ['admin'],
      });

      await permissionCache.initialize();
    });

    it('should allow doctor to access records (has read permission)', async () => {
      const response = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${doctorToken}`);

      // This should succeed or return 200 (depending on if records exist)
      expect([200, 404]).toContain(response.status);
    });

    it('should allow admin to access all resources', async () => {
      const response = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin should always have access
      expect([200, 404]).toContain(response.status);
    });

    it('should prevent patient from creating records (lacks create permission)', async () => {
      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          patientName: 'Test Patient',
          diagnosis: 'Test',
          treatment: 'Test',
          txHash: 'test_hash',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Forbidden');
    });

    it('should allow doctor to create records (has create permission)', async () => {
      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientName: 'Test Patient',
          diagnosis: 'Test',
          treatment: 'Test',
          txHash: 'test_hash',
        });

      // Should succeed or fail validation, but not be forbidden
      expect(response.status).not.toBe(403);
    });
  });

  describe('Cache Updates on Permission Changes', () => {
    it('should update cache when permission is created', async () => {
      await permissionCache.initialize();

      expect(permissionCache.hasPermission('doctor', 'appointments', 'create')).toBe(false);

      // Create new permission via API
      await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'appointments',
          action: 'create',
          roles: ['doctor'],
        });

      // Cache should be updated
      expect(permissionCache.hasPermission('doctor', 'appointments', 'create')).toBe(true);
    });

    it('should update cache when permission is modified', async () => {
      const permission = await Permission.create({
        resource: 'users',
        action: 'read',
        roles: ['admin'],
      });

      await permissionCache.initialize();
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(false);

      // Update permission via API
      await request(app)
        .put(`/api/permissions/${permission._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roles: ['admin', 'doctor'],
        });

      // Cache should be updated
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(true);
    });

    it('should update cache when permission is deleted', async () => {
      const permission = await Permission.create({
        resource: 'users',
        action: 'read',
        roles: ['admin', 'doctor'],
      });

      await permissionCache.initialize();
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(true);

      // Delete permission via API
      await request(app)
        .delete(`/api/permissions/${permission._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Cache should be updated
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(false);
    });
  });

  describe('Cache Statistics and Management', () => {
    beforeEach(async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
      });
      await permissionCache.initialize();
    });

    it('should provide cache statistics', async () => {
      const response = await request(app)
        .get('/api/permissions/cache/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('size');
      expect(response.body.data).toHaveProperty('hits');
      expect(response.body.data).toHaveProperty('misses');
      expect(response.body.data).toHaveProperty('hitRate');
    });

    it('should allow cache refresh', async () => {
      // Add a new permission directly to DB (bypassing API)
      await Permission.create({
        resource: 'files',
        action: 'read',
        roles: ['doctor'],
      });

      // Cache doesn't have it yet
      expect(permissionCache.hasPermission('doctor', 'files', 'read')).toBe(false);

      // Refresh cache via API
      const response = await request(app)
        .post('/api/permissions/cache/refresh')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Now cache should have it
      expect(permissionCache.hasPermission('doctor', 'files', 'read')).toBe(true);
    });
  });

  describe('Permission Validation', () => {
    it('should validate resource format', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'INVALID RESOURCE!', // Invalid format
          action: 'read',
          roles: ['admin'],
        });

      expect(response.status).toBe(400);
    });

    it('should validate action values', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'records',
          action: 'invalid_action',
          roles: ['admin'],
        });

      expect(response.status).toBe(400);
    });

    it('should validate role values', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'records',
          action: 'read',
          roles: ['invalid_role'],
        });

      expect(response.status).toBe(400);
    });

    it('should require at least one role', async () => {
      const response = await request(app)
        .post('/api/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'records',
          action: 'read',
          roles: [],
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Admin Inheritance', () => {
    beforeEach(async () => {
      // Set up minimal permissions (admin should access everything anyway)
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['doctor'],
      });

      await permissionCache.initialize();
    });

    it('should allow admin to access resources even without explicit permission', async () => {
      // Doctor has permission, admin doesn't explicitly have it, but should inherit
      const response = await request(app)
        .get('/api/records')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin should have access regardless
      expect(response.status).not.toBe(403);
    });

    it('should allow admin to perform any action', async () => {
      // No permission exists for this action, but admin should still access
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      // Admin should have access
      expect(response.status).not.toBe(403);
    });
  });
});
