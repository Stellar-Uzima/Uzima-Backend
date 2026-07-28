import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Performance Tests (Load & Benchmark)', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Response Time Tests', () => {
    it('GET /health should respond within 100ms', async () => {
      const start = Date.now();
      await request(server)
        .get('/health')
        .expect(200);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('GET /api/v1/users/profile should respond within 200ms', async () => {
      const start = Date.now();
      await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer test-token')
        .expect(401); // Unauthorized is fine, we just measure response time
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle 50 concurrent requests to /health', async () => {
      const requests = Array(50).fill(null).map(() =>
        request(server).get('/health')
      );
      
      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;
      
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });
      expect(duration).toBeLessThan(5000);
    });

    it('should handle 20 concurrent auth requests', async () => {
      const requests = Array(20).fill(null).map(() =>
        request(server)
          .post('/api/v1/auth/login')
          .send({ email: 'test@example.com', password: 'wrongpassword' })
      );
      
      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;
      
      responses.forEach(res => {
        expect(res.status).toBe(401);
      });
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('Large Dataset Tests', () => {
    it('GET /api/v1/users?limit=1000 should handle large result sets', async () => {
      const start = Date.now();
      const response = await request(server)
        .get('/api/v1/users?limit=1000')
        .set('Authorization', 'Bearer test-token');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(3000);
      
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('GET /api/v1/transactions?limit=500 should complete within timeout', async () => {
      const start = Date.now();
      const response = await request(server)
        .get('/api/v1/transactions?limit=500')
        .set('Authorization', 'Bearer test-token');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Database Query Performance', () => {
    it('should execute complex queries efficiently', async () => {
      const start = Date.now();
      await request(server)
        .get('/api/v1/analytics/dashboard/overview')
        .set('Authorization', 'Bearer test-token');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle filtered queries with joins', async () => {
      const start = Date.now();
      await request(server)
        .get('/api/v1/reports?type=monthly&year=2024')
        .set('Authorization', 'Bearer test-token');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1500);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate 10 sequential requests
      for (let i = 0; i < 10; i++) {
        await request(server)
          .get('/health')
          .expect(200);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      // Memory increase should be less than 10MB
      expect(memoryIncrease).toBeLessThan(10);
    });
  });
});

describe('Performance Benchmarks - Slow Endpoints', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  // Track slow endpoints for optimization
  const endpoints = [
    { method: 'GET', path: '/api/v1/projects', threshold: 500 },
    { method: 'GET', path: '/api/v1/credits', threshold: 500 },
    { method: 'POST', path: '/api/v1/retirements', threshold: 1000 },
  ];

  endpoints.forEach(({ method, path, threshold }) => {
    it(`${method} ${path} should respond within ${threshold}ms`, async () => {
      const start = Date.now();
      let req: any = request(server);
      
      req = req[method.toLowerCase()](path);
      
      if (path.includes('/retirements')) {
        req = req.set('Authorization', 'Bearer test-token');
      }
      
      await req;
      const duration = Date.now() - start;
      
      // Log slow endpoint for optimization
      if (duration > threshold) {
        console.warn(`⚠️ Slow endpoint detected: ${method} ${path} took ${duration}ms`);
      }
      
      expect(duration).toBeLessThan(threshold);
    });
  });
}); 