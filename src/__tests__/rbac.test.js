/* eslint-disable prettier/prettier */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { performance } from 'perf_hooks';
import Permission from '../models/Permission.js';
import permissionCache from '../services/permissionCache.js';
import hasPermission from '../middleware/rbac.js';

describe('RBAC Permission System', () => {
  
  describe('Permission Model', () => {
    beforeEach(async () => {
      await Permission.deleteMany({});
    });

    it('should create a permission with valid data', async () => {
      const permissionData = {
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
        description: 'View medical records',
      };

      const permission = await Permission.create(permissionData);

      expect(permission).toBeDefined();
      expect(permission.resource).toBe('records');
      expect(permission.action).toBe('read');
      expect(permission.roles).toEqual(['admin', 'doctor']);
      expect(permission.description).toBe('View medical records');
      expect(permission.createdAt).toBeDefined();
      expect(permission.updatedAt).toBeDefined();
    });

    it('should enforce unique constraint on resource and action', async () => {
      const permissionData = {
        resource: 'records',
        action: 'read',
        roles: ['admin'],
        description: 'First permission',
      };

      await Permission.create(permissionData);

      // Try to create duplicate
      await expect(
        Permission.create({
          resource: 'records',
          action: 'read',
          roles: ['doctor'],
          description: 'Duplicate permission',
        })
      ).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      // Missing resource
      await expect(
        Permission.create({
          action: 'read',
          roles: ['admin'],
        })
      ).rejects.toThrow();

      // Missing action
      await expect(
        Permission.create({
          resource: 'records',
          roles: ['admin'],
        })
      ).rejects.toThrow();

      // Missing roles
      await expect(
        Permission.create({
          resource: 'records',
          action: 'read',
        })
      ).rejects.toThrow();
    });

    it('should validate action enum values', async () => {
      await expect(
        Permission.create({
          resource: 'records',
          action: 'invalid_action',
          roles: ['admin'],
        })
      ).rejects.toThrow();
    });

    it('should validate role enum values', async () => {
      await expect(
        Permission.create({
          resource: 'records',
          action: 'read',
          roles: ['invalid_role'],
        })
      ).rejects.toThrow();
    });

    it('should validate at least one role is specified', async () => {
      await expect(
        Permission.create({
          resource: 'records',
          action: 'read',
          roles: [],
        })
      ).rejects.toThrow();
    });

    it('should have hasRole instance method', async () => {
      const permission = await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
      });

      expect(permission.hasRole('admin')).toBe(true);
      expect(permission.hasRole('doctor')).toBe(true);
      expect(permission.hasRole('patient')).toBe(false);
    });

    it('should have findByRole static method', async () => {
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
      await Permission.create({
        resource: 'users',
        action: 'read',
        roles: ['admin'],
      });

      const adminPermissions = await Permission.findByRole('admin');
      expect(adminPermissions).toHaveLength(3);

      const doctorPermissions = await Permission.findByRole('doctor');
      expect(doctorPermissions).toHaveLength(1);

      const patientPermissions = await Permission.findByRole('patient');
      expect(patientPermissions).toHaveLength(0);
    });

    it('should have findByResourceAction static method', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
      });

      const permission = await Permission.findByResourceAction('records', 'read');
      expect(permission).toBeDefined();
      expect(permission.resource).toBe('records');
      expect(permission.action).toBe('read');

      const notFound = await Permission.findByResourceAction('records', 'delete');
      expect(notFound).toBeNull();
    });
  });

  describe('Permission Cache', () => {
    beforeEach(async () => {
      await Permission.deleteMany({});
      permissionCache.invalidate();
      permissionCache.resetMetrics();
    });

    afterEach(() => {
      permissionCache.stopAutoRefresh();
    });

    it('should initialize cache from database', async () => {
      // Create test permissions
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

      await permissionCache.initialize();

      expect(permissionCache.hasPermission('admin', 'records', 'read')).toBe(true);
      expect(permissionCache.hasPermission('doctor', 'records', 'read')).toBe(true);
      expect(permissionCache.hasPermission('admin', 'records', 'create')).toBe(true);
      expect(permissionCache.hasPermission('doctor', 'records', 'create')).toBe(false);
    });

    it('should return correct results from hasPermission', async () => {
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

      await permissionCache.initialize();

      // Admin has all permissions
      expect(permissionCache.hasPermission('admin', 'records', 'read')).toBe(true);
      expect(permissionCache.hasPermission('admin', 'records', 'create')).toBe(true);

      // Doctor has read and create
      expect(permissionCache.hasPermission('doctor', 'records', 'read')).toBe(true);
      expect(permissionCache.hasPermission('doctor', 'records', 'create')).toBe(true);

      // Patient has only read
      expect(permissionCache.hasPermission('patient', 'records', 'read')).toBe(true);
      expect(permissionCache.hasPermission('patient', 'records', 'create')).toBe(false);

      // Educator has no permissions
      expect(permissionCache.hasPermission('educator', 'records', 'read')).toBe(false);
    });

    it('should handle cache invalidation', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin'],
      });

      await permissionCache.initialize();
      expect(permissionCache.hasPermission('admin', 'records', 'read')).toBe(true);

      permissionCache.invalidate();
      expect(permissionCache.hasPermission('admin', 'records', 'read')).toBe(false);
    });

    it('should perform cache lookups in under 5ms', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
      });

      await permissionCache.initialize();

      // Warm up
      permissionCache.hasPermission('admin', 'records', 'read');

      // Test performance
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        permissionCache.hasPermission('admin', 'records', 'read');
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(5);
      console.log(`Average cache lookup time: ${avgTime.toFixed(4)}ms`);
    });

    it('should handle cache misses gracefully', async () => {
      await permissionCache.initialize();

      expect(permissionCache.hasPermission('admin', 'nonexistent', 'read')).toBe(false);
      expect(permissionCache.hasPermission('unknown_role', 'records', 'read')).toBe(false);
    });

    it('should track cache metrics', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin'],
      });

      await permissionCache.initialize();
      permissionCache.resetMetrics();

      // Generate hits and misses
      permissionCache.hasPermission('admin', 'records', 'read'); // hit
      permissionCache.hasPermission('admin', 'records', 'read'); // hit
      permissionCache.hasPermission('doctor', 'records', 'create'); // miss

      const metrics = permissionCache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(parseFloat(metrics.hitRate)).toBeCloseTo(66.67, 1);
    });

    it('should add permission to cache', async () => {
      await permissionCache.initialize();

      const permission = await Permission.create({
        resource: 'users',
        action: 'read',
        roles: ['admin'],
      });

      permissionCache.add(permission);

      expect(permissionCache.hasPermission('admin', 'users', 'read')).toBe(true);
    });

    it('should remove permission from cache', async () => {
      const permission = await Permission.create({
        resource: 'users',
        action: 'read',
        roles: ['admin', 'doctor'],
      });

      await permissionCache.initialize();
      expect(permissionCache.hasPermission('admin', 'users', 'read')).toBe(true);

      permissionCache.remove('users', 'read');
      expect(permissionCache.hasPermission('admin', 'users', 'read')).toBe(false);
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(false);
    });

    it('should update permission in cache', async () => {
      const permission = await Permission.create({
        resource: 'users',
        action: 'read',
        roles: ['admin'],
      });

      await permissionCache.initialize();
      expect(permissionCache.hasPermission('admin', 'users', 'read')).toBe(true);
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(false);

      // Update permission
      permission.roles = ['admin', 'doctor'];
      permissionCache.update(permission);

      expect(permissionCache.hasPermission('admin', 'users', 'read')).toBe(true);
      expect(permissionCache.hasPermission('doctor', 'users', 'read')).toBe(true);
    });

    it('should get permissions by role', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['admin', 'doctor'],
        description: 'Read records',
      });
      await Permission.create({
        resource: 'records',
        action: 'create',
        roles: ['admin'],
        description: 'Create records',
      });

      await permissionCache.initialize();

      const adminPerms = permissionCache.getPermissionsByRole('admin');
      expect(adminPerms).toHaveLength(2);

      const doctorPerms = permissionCache.getPermissionsByRole('doctor');
      expect(doctorPerms).toHaveLength(1);
      expect(doctorPerms[0].resource).toBe('records');
      expect(doctorPerms[0].action).toBe('read');
    });
  });

  describe('RBAC Middleware', () => {
    let req, res, next;

    beforeEach(async () => {
      await Permission.deleteMany({});
      permissionCache.invalidate();

      req = {
        user: null,
      };

      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      next = vi.fn();
    });

    afterEach(() => {
      permissionCache.stopAutoRefresh();
    });

    it('should block access when user is not authenticated', () => {
      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: No user role',
        message: 'User authentication or role information is missing',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should block access when user has no role', () => {
      req.user = { id: '123' };

      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: No user role',
        message: 'User authentication or role information is missing',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access for admin role (inherits all permissions)', () => {
      req.user = { id: '123', role: 'admin' };

      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access when user has permission', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['doctor'],
      });
      await permissionCache.initialize();

      req.user = { id: '123', role: 'doctor' };

      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block access when user lacks permission', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['doctor'],
      });
      await permissionCache.initialize();

      req.user = { id: '123', role: 'patient' };

      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: Insufficient permissions',
        required: { resource: 'records', action: 'read' },
        userRole: 'patient',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should log slow permission checks', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['doctor'],
      });
      await permissionCache.initialize();

      req.user = { id: '123', role: 'doctor' };

      // Mock performance.now to simulate slow check
      const originalPerformanceNow = performance.now;
      let callCount = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 10; // 10ms difference
      });

      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slow permission check')
      );

      consoleWarnSpy.mockRestore();
      performance.now = originalPerformanceNow;
    });

    it('should complete permission check in under 5ms', async () => {
      await Permission.create({
        resource: 'records',
        action: 'read',
        roles: ['doctor'],
      });
      await permissionCache.initialize();

      req.user = { id: '123', role: 'doctor' };

      const startTime = performance.now();
      const middleware = hasPermission('records', 'read');
      middleware(req, res, next);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5);
      console.log(`Permission check completed in: ${duration.toFixed(4)}ms`);
    });
  });

  describe('Performance Benchmarks', () => {
    beforeAll(async () => {
      await Permission.deleteMany({});
      
      // Create realistic permission set
      const permissions = [
        { resource: 'records', action: 'read', roles: ['admin', 'doctor', 'patient'] },
        { resource: 'records', action: 'create', roles: ['admin', 'doctor'] },
        { resource: 'records', action: 'update', roles: ['admin', 'doctor'] },
        { resource: 'records', action: 'delete', roles: ['admin'] },
        { resource: 'users', action: 'read', roles: ['admin'] },
        { resource: 'users', action: 'manage', roles: ['admin'] },
        { resource: 'appointments', action: 'read', roles: ['admin', 'doctor', 'patient'] },
        { resource: 'appointments', action: 'create', roles: ['admin', 'doctor', 'patient'] },
        { resource: 'prescriptions', action: 'read', roles: ['admin', 'doctor', 'patient'] },
        { resource: 'prescriptions', action: 'create', roles: ['admin', 'doctor'] },
      ];

      await Permission.insertMany(permissions);
      await permissionCache.initialize();
    });

    it('should maintain cache hit rate above 95%', () => {
      permissionCache.resetMetrics();

      // Simulate 100 permission checks
      for (let i = 0; i < 100; i++) {
        permissionCache.hasPermission('doctor', 'records', 'read');
        permissionCache.hasPermission('patient', 'records', 'read');
        permissionCache.hasPermission('doctor', 'prescriptions', 'create');
        // Add some misses
        if (i % 20 === 0) {
          permissionCache.hasPermission('patient', 'nonexistent', 'read');
        }
      }

      const metrics = permissionCache.getMetrics();
      const hitRate = parseFloat(metrics.hitRate);
      
      console.log(`Cache hit rate: ${hitRate}%`);
      expect(hitRate).toBeGreaterThan(95);
    });

    it('should handle high load efficiently', async () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        permissionCache.hasPermission('doctor', 'records', 'read');
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      console.log(`Average time for ${iterations} checks: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1); // Should be under 1ms for in-memory cache
    });
  });
});
