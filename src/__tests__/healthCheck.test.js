import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthzRoutes from '../routes/healthzRoutes.js';
import healthCheckService from '../services/healthCheck.js';

const app = express();
app.use('/healthz', healthzRoutes);

describe('Health Check Endpoints', () => {
  describe('GET /healthz/live - Liveness Probe', () => {
    it('should return 200 with alive status', async () => {
      const res = await request(app).get('/healthz/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(res.body.timestamp).toBeDefined();
    });

    it('should include process info', async () => {
      const res = await request(app).get('/healthz/live');

      expect(res.body.checks.process).toBeDefined();
      expect(res.body.checks.process.pid).toBe(process.pid);
      expect(res.body.checks.process.uptime).toBeGreaterThan(0);
    });

    it('should include memory metrics', async () => {
      const res = await request(app).get('/healthz/live');

      const mem = res.body.checks.process.memory;
      expect(mem.rss).toBeGreaterThan(0);
      expect(mem.heapTotal).toBeGreaterThan(0);
      expect(mem.heapUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /healthz/ready - Readiness Probe', () => {
    it('should return structured response', async () => {
      const res = await request(app).get('/healthz/ready');

      expect(res.body.status).toMatch(/^(ready|not-ready)$/);
      expect(res.body.message).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.checks).toBeDefined();
    });

    it('should include all component checks', async () => {
      const res = await request(app).get('/healthz/ready');

      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.redis).toBeDefined();
      expect(res.body.checks.queue).toBeDefined();
      expect(res.body.checks.process).toBeDefined();
    });

    it('should have valid status values for each check', async () => {
      const res = await request(app).get('/healthz/ready');

      expect(res.body.checks.database.status).toMatch(/^(up|down)$/);
      expect(res.body.checks.redis.status).toMatch(/^(up|down)$/);
      expect(res.body.checks.queue.status).toMatch(/^(up|down)$/);
      expect(res.body.checks.process.status).toBe('up');
    });

    it('should return 200 when all components healthy', async () => {
      vi.spyOn(healthCheckService, 'getReadiness').mockResolvedValueOnce({
        status: 'ready',
        message: 'All dependencies are healthy',
        checks: {
          database: { status: 'up', latency: 5 },
          redis: { status: 'up', latency: 3 },
          queue: { status: 'up', latency: 4 },
          process: { status: 'up', uptime: 1000 },
        },
        timestamp: new Date().toISOString(),
      });

      const res = await request(app).get('/healthz/ready');
      expect(res.status).toBe(200);
    });

    it('should return 503 when dependencies unhealthy', async () => {
      vi.spyOn(healthCheckService, 'getReadiness').mockResolvedValueOnce({
        status: 'not-ready',
        message: 'One or more dependencies unhealthy',
        checks: {
          database: { status: 'down', latency: 100, message: 'Connection failed' },
          redis: { status: 'up', latency: 3 },
          queue: { status: 'up', latency: 4 },
          process: { status: 'up', uptime: 1000 },
        },
        timestamp: new Date().toISOString(),
      });

      const res = await request(app).get('/healthz/ready');
      expect(res.status).toBe(503);
    });
  });

  describe('Health Check Service', () => {
    describe('checkProcess()', () => {
      it('should return valid process metrics', () => {
        const health = healthCheckService.checkProcess();

        expect(health.status).toBe('up');
        expect(health.pid).toBe(process.pid);
        expect(health.uptime).toBeGreaterThan(0);
        expect(health.memory.rss).toBeGreaterThan(0);
      });
    });

    describe('checkDatabase()', () => {
      it('should return object with required fields', () => {
        const health = healthCheckService.checkDatabase();

        expect(health.status).toMatch(/^(up|down)$/);
        expect(health.latency).toBeGreaterThanOrEqual(0);
        expect(health.message).toBeDefined();
      });

      it('should check MongoDB connection state', () => {
        const health = healthCheckService.checkDatabase();

        // Connection state should be checked
        expect(health.status).toBeDefined();
        expect(health.message).toContain('MongoDB');
      });
    });

    describe('checkRedis()', () => {
      it('should return async health status', async () => {
        const health = await healthCheckService.checkRedis();

        expect(health.status).toMatch(/^(up|down)$/);
        expect(health.latency).toBeGreaterThanOrEqual(0);
        expect(health.message).toBeDefined();
      });

      it('should handle connection failures gracefully', async () => {
        const health = await healthCheckService.checkRedis();

        // Should not throw, even if Redis is down
        expect(health).toBeDefined();
      });
    });

    describe('checkQueue()', () => {
      it('should return async queue status', async () => {
        const health = await healthCheckService.checkQueue();

        expect(health.status).toMatch(/^(up|down)$/);
        expect(health.latency).toBeGreaterThanOrEqual(0);
        expect(health.message).toBeDefined();
      });

      it('should handle queue connection failures gracefully', async () => {
        const health = await healthCheckService.checkQueue();

        // Should not throw
        expect(health).toBeDefined();
      });
    });

    describe('getLiveness()', () => {
      it('should return liveness status', async () => {
        const health = await healthCheckService.getLiveness();

        expect(health.status).toBe('alive');
        expect(health.checks.process).toBeDefined();
        expect(health.timestamp).toBeDefined();
      });
    });

    describe('getReadiness()', () => {
      it('should return readiness with all components', async () => {
        const health = await healthCheckService.getReadiness();

        expect(['ready', 'not-ready']).toContain(health.status);
        expect(health.checks).toHaveProperty('database');
        expect(health.checks).toHaveProperty('redis');
        expect(health.checks).toHaveProperty('queue');
        expect(health.checks).toHaveProperty('process');
      });

      it('should set ready=true only when all components up', async () => {
        const health = await healthCheckService.getReadiness();

        const allHealthy =
          health.checks.database.status === 'up' &&
          health.checks.redis.status === 'up' &&
          health.checks.queue.status === 'up';

        expect(health.status === 'ready').toBe(allHealthy);
      });
    });
  });
});
