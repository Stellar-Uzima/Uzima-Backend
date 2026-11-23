
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';

type HttpMethod = 'GET' | 'POST';

interface SlowEndpoint {
  method: HttpMethod;
  path: string;
  threshold: number;
  requiresAuth?: boolean;
}

const AUTH_TOKEN = 'Bearer test-token';

const TEST_CREDENTIALS = {
  email: 'test@example.com',
  password: 'wrongpassword',
};

const SLOW_ENDPOINTS: SlowEndpoint[] = [
  { method: 'GET', path: '/api/v1/projects', threshold: 500 },
  { method: 'GET', path: '/api/v1/credits', threshold: 500 },
  {
    method: 'POST',
    path: '/api/v1/retirements',
    threshold: 1000,
    requiresAuth: true,
  },
];

async function createTestApplication(): Promise<{
  app: INestApplication;
  server: Server;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  await app.init();

  return {
    app,
    server: app.getHttpServer() as Server,
  };
}

async function measureExecutionTime<T>(
  operation: () => Promise<T>,
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await operation();
  const duration = performance.now() - start;

  return { result, duration };
}

function expectWithinThreshold(
  duration: number,
  threshold: number,
): void {
  expect(duration).toBeLessThan(threshold);
}

function createEndpointRequest(
  server: Server,
  method: HttpMethod,
  path: string,
) {
  return method === 'GET'
    ? request(server).get(path)
    : request(server).post(path);
}

// =====================================================
// Performance Tests (Load & Benchmark)
// =====================================================

describe('Performance Tests (Load & Benchmark)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const application = await createTestApplication();

    app = application.app;
    server = application.server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Response Time Tests', () => {
    it('GET /health should respond within 100ms', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server).get('/health').expect(200),
      );

      expectWithinThreshold(duration, 100);
    });

    it('GET /api/v1/users/profile should respond within 200ms', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/users/profile')
          .set('Authorization', AUTH_TOKEN)
          .expect(401),
      );

      expectWithinThreshold(duration, 200);
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle 50 concurrent requests to /health', async () => {
      const requests = Array.from({ length: 50 }, () =>
        request(server).get('/health'),
      );

      const { result: responses, duration } =
        await measureExecutionTime(() => Promise.all(requests));

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      expectWithinThreshold(duration, 5000);
    });

    it('should handle 20 concurrent auth requests', async () => {
      const requests = Array.from({ length: 20 }, () =>
        request(server)
          .post('/api/v1/auth/login')
          .send(TEST_CREDENTIALS),
      );

      const { result: responses, duration } =
        await measureExecutionTime(() => Promise.all(requests));

      responses.forEach((response) => {
        expect(response.status).toBe(401);
      });

      expectWithinThreshold(duration, 3000);
    });
  });

  describe('Large Dataset Tests', () => {
    it('GET /api/v1/users?limit=1000 should handle large result sets', async () => {
      const { result: response, duration } =
        await measureExecutionTime(() =>
          request(server)
            .get('/api/v1/users?limit=1000')
            .set('Authorization', AUTH_TOKEN),
        );

      expectWithinThreshold(duration, 3000);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it('GET /api/v1/transactions?limit=500 should complete within timeout', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/transactions?limit=500')
          .set('Authorization', AUTH_TOKEN),
      );

      expectWithinThreshold(duration, 5000);
    });
  });

  describe('Database Query Performance', () => {
    it('should execute complex queries efficiently', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/analytics/dashboard/overview')
          .set('Authorization', AUTH_TOKEN),
      );

      expectWithinThreshold(duration, 1000);
    });

    it('should handle filtered queries with joins', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/reports?type=monthly&year=2024')
          .set('Authorization', AUTH_TOKEN),
      );

      expectWithinThreshold(duration, 1500);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate 10 sequential requests.
      for (let i = 0; i < 10; i++) {
        await request(server)
          .get('/health')
          .expect(200);
      }

      const finalMemory = process.memoryUsage().heapUsed;

      const memoryIncrease =
        (finalMemory - initialMemory) / 1024 / 1024;

      // Memory increase should be less than 10MB.
      expect(memoryIncrease).toBeLessThan(10);
    });
  });
});

// =====================================================
// Performance Benchmarks - Slow Endpoints
// =====================================================

describe('Performance Benchmarks - Slow Endpoints', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const application = await createTestApplication();

    app = application.app;
    server = application.server;
  });

  afterAll(async () => {
    await app.close();
  });

  SLOW_ENDPOINTS.forEach(({ method, path, threshold, requiresAuth }) => {
    it(`${method} ${path} should respond within ${threshold}ms`, async () => {
      let endpointRequest = createEndpointRequest(
        server,
        method,
        path,
      );

      if (requiresAuth) {
        endpointRequest = endpointRequest.set(
          'Authorization',
          AUTH_TOKEN,
        );
      }

      const { duration } = await measureExecutionTime(
        () => endpointRequest,
      );

      // Log slow endpoints for optimization.
      if (duration > threshold) {
        console.warn(
          `⚠️ Slow endpoint detected: ${method} ${path} took ${duration.toFixed(2)}ms`,
        );
      }

      expectWithinThreshold(duration, threshold);
    });
  });
});
