/**
 * Multi-Tenant Data Isolation Tests
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { createServer } from 'http';
import app from '../app.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import Record from '../models/Record.js';
import { generateAccessToken } from '../utils/generateToken.js';
import {
  extractTenant,
  validateTenant,
  preventCrossTenantAccess,
} from '../middleware/tenantMiddleware.js';

describe('Multi-Tenant Data Isolation', () => {
  let tenant1, tenant2;
  let user1, user2;
  let token1, token2;

  beforeAll(async () => {
    // Create test tenants
    tenant1 = await Tenant.create({
      name: 'Tenant One',
      slug: 'tenant-one',
      status: 'active',
    });

    tenant2 = await Tenant.create({
      name: 'Tenant Two',
      slug: 'tenant-two',
      status: 'active',
    });

    // Create test users in different tenants
    user1 = await User.create({
      username: 'user1',
      email: 'user1@tenant1.com',
      password: 'password123',
      role: 'doctor',
      tenantId: tenant1._id,
    });

    user2 = await User.create({
      username: 'user2',
      email: 'user2@tenant2.com',
      password: 'password123',
      role: 'doctor',
      tenantId: tenant2._id,
    });

    // Generate tokens
    token1 = generateAccessToken(user1);
    token2 = generateAccessToken(user2);
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Tenant.deleteMany({});
    await Record.deleteMany({});
  });

  describe('Tenant Model', () => {
    test('should create a tenant with required fields', async () => {
      const tenant = await Tenant.create({
        name: 'Test Tenant',
        slug: 'test-tenant',
      });

      expect(tenant.name).toBe('Test Tenant');
      expect(tenant.slug).toBe('test-tenant');
      expect(tenant.status).toBe('active');
    });

    test('should enforce unique slug', async () => {
      await Tenant.create({
        name: 'Unique Tenant',
        slug: 'unique-tenant',
      });

      await expect(
        Tenant.create({
          name: 'Duplicate Tenant',
          slug: 'unique-tenant',
        })
      ).rejects.toThrow();
    });
  });

  describe('User Model - Tenant Isolation', () => {
    test('should require tenantId for user creation', async () => {
      await expect(
        User.create({
          username: 'notenant',
          email: 'no@tenant.com',
          password: 'password123',
          role: 'patient',
        })
      ).rejects.toThrow();
    });

    test('should store tenantId in user document', async () => {
      const user = await User.findById(user1._id);
      expect(user.tenantId.toString()).toBe(tenant1._id.toString());
    });
  });

  describe('JWT Token - Tenant Claims', () => {
    test('should include tenantId in JWT token', () => {
      const decoded = JSON.parse(Buffer.from(token1.split('.')[1], 'base64').toString());
      expect(decoded.tenantId).toBeDefined();
      expect(decoded.tenantId).toBe(tenant1._id.toString());
    });

    test('should have different tenantIds in different user tokens', () => {
      const decoded1 = JSON.parse(Buffer.from(token1.split('.')[1], 'base64').toString());
      const decoded2 = JSON.parse(Buffer.from(token2.split('.')[1], 'base64').toString());

      expect(decoded1.tenantId).not.toBe(decoded2.tenantId);
    });
  });

  describe('Tenant Middleware', () => {
    test('extractTenant should attach tenantId to request', () => {
      const req = {
        user: { tenantId: tenant1._id.toString() },
      };
      const res = {};
      const next = jest.fn();

      extractTenant(req, res, next);

      expect(req.tenantId).toBe(tenant1._id.toString());
      expect(next).toHaveBeenCalled();
    });

    test('extractTenant should reject if no tenantId in token', () => {
      const req = { user: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      extractTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant ID required in token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('validateTenant should reject if tenant not found', async () => {
      const req = { tenantId: new mongoose.Types.ObjectId().toString() };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await validateTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    });

    test('validateTenant should reject if tenant is suspended', async () => {
      const suspendedTenant = await Tenant.create({
        name: 'Suspended Tenant',
        slug: 'suspended-tenant',
        status: 'suspended',
      });

      const req = { tenantId: suspendedTenant._id.toString() };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await validateTenant(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant is suspended' });
    });

    test('preventCrossTenantAccess should reject cross-tenant access', () => {
      const req = {
        user: { tenantId: tenant1._id.toString() },
        tenantId: tenant2._id.toString(),
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      preventCrossTenantAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cross-tenant access denied' });
    });
  });

  describe('Data Isolation', () => {
    beforeAll(async () => {
      // Create records in different tenants
      await Record.create({
        patientName: 'Patient A',
        diagnosis: 'Flu',
        treatment: 'Rest',
        txHash: 'tx1',
        clientUUID: 'uuid-1',
        syncTimestamp: new Date(),
        createdBy: user1._id,
        tenantId: tenant1._id,
      });

      await Record.create({
        patientName: 'Patient B',
        diagnosis: 'Cold',
        treatment: 'Medicine',
        txHash: 'tx2',
        clientUUID: 'uuid-2',
        syncTimestamp: new Date(),
        createdBy: user2._id,
        tenantId: tenant2._id,
      });
    });

    test('should only query records from same tenant', async () => {
      const tenant1Records = await Record.find({ tenantId: tenant1._id });
      const tenant2Records = await Record.find({ tenantId: tenant2._id });

      expect(tenant1Records).toHaveLength(1);
      expect(tenant2Records).toHaveLength(1);
      expect(tenant1Records[0].patientName).toBe('Patient A');
      expect(tenant2Records[0].patientName).toBe('Patient B');
    });

    test('should not find records from other tenant', async () => {
      const record = await Record.findOne({
        tenantId: tenant1._id,
        patientName: 'Patient B',
      });

      expect(record).toBeNull();
    });
  });

  describe('Tenant Admin Endpoints', () => {
    let adminUser, adminToken;

    beforeAll(async () => {
      adminUser = await User.create({
        username: 'admin',
        email: 'admin@system.com',
        password: 'password123',
        role: 'admin',
        tenantId: tenant1._id,
      });

      adminToken = generateAccessToken(adminUser);
    });

    test('GET /api/admin/tenants should return all tenants', async () => {
      const response = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenants).toBeDefined();
      expect(response.body.data.tenants.length).toBeGreaterThanOrEqual(2);
    });

    test('POST /api/admin/tenants should create new tenant', async () => {
      const response = await request(app)
        .post('/api/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Test Tenant',
          slug: 'new-test-tenant',
          description: 'A test tenant',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenant.name).toBe('New Test Tenant');
    });

    test('GET /api/admin/tenants/:id should return tenant details', async () => {
      const response = await request(app)
        .get(`/api/admin/tenants/${tenant1._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenant.name).toBe('Tenant One');
    });

    test('PUT /api/admin/tenants/:id should update tenant', async () => {
      const response = await request(app)
        .put(`/api/admin/tenants/${tenant1._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Tenant One',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenant.name).toBe('Updated Tenant One');
    });

    test('GET /api/admin/tenants/:id/users should return tenant users', async () => {
      const response = await request(app)
        .get(`/api/admin/tenants/${tenant1._id}/users`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeDefined();
    });

    test('GET /api/admin/tenants/:id/stats should return tenant statistics', async () => {
      const response = await request(app)
        .get(`/api/admin/tenants/${tenant1._id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.stats).toBeDefined();
    });
  });
});
