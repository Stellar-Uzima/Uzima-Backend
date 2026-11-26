
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';

type HttpMethod = 'GET' | 'POST';

interface EndpointBenchmark {
  method: HttpMethod;
  path: string;
  threshold: number;
  requiresAuth?: boolean;
}

const PERFORMANCE_THRESHOLDS = {
  health: 100,
  profile: 200,
  concurrentHealth: 5000,
  concurrentAuth: 3000,
  largeUsers: 3000,
  largeTransactions: 5000,
  dashboard: 1000,
  reports: 1500,
  memoryIncrease: 10,
};

const TEST_CREDENTIALS = {
  email: 'test@example.com',
  password: 'wrongpassword',
};

const AUTH_TOKEN = 'Bearer test-token';

const SLOW_ENDPOINTS: EndpointBenchmark[] = [
  { method: 'GET', path: '/api/v1/projects', threshold: 500 },
  { method: 'GET', path: '/api/v1/credits', threshold: 500 },
  {
    method: 'POST',
    path: '/api/v1/retirements',
    threshold: 1000,
    requiresAuth: true,
  },
];

describe('Performance Tests (Load & Benchmark)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const application = await createTestApplication();

    app = moduleFixture.createNestApplication();

    await app.init();

    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  const measureExecutionTime = async <T>(
    callback: () => Promise<T>,
  ): Promise<{ result: T; duration: number }> => {
    const start = performance.now();

    const result = await callback();

    return {
      result,
      duration: performance.now() - start,
    };
  };

  describe('Response Time Tests', () => {
    it('GET /health should respond within 100ms', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server).get('/health').expect(200),
      );

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.health);
    });

    it('GET /api/v1/users/profile should respond within 200ms', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/users/profile')
          .set('Authorization', AUTH_TOKEN)
          .expect(401),
      );

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.profile);
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle 50 concurrent requests to /health', async () => {
      const { result: responses, duration } = await measureExecutionTime(() =>
        Promise.all(
          Array.from({ length: 50 }, () => request(server).get('/health')),
        ),
      );

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      expect(duration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.concurrentHealth,
      );
    });

    it('should handle 20 concurrent auth requests', async () => {
      const { result: responses, duration } = await measureExecutionTime(() =>
        Promise.all(
          Array.from({ length: 20 }, () =>
            request(server)
              .post('/api/v1/auth/login')
              .send(TEST_CREDENTIALS),
          ),
        ),
      );

      responses.forEach((response) => {
        expect(response.status).toBe(401);
      });

      expect(duration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.concurrentAuth,
      );
    });
  });

  describe('Large Dataset Tests', () => {
    it('GET /api/v1/users?limit=1000 should handle large result sets', async () => {
      const { result: response, duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/users?limit=1000')
          .set('Authorization', AUTH_TOKEN),
      );

      expect(duration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.largeUsers,
      );

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

      expect(duration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.largeTransactions,
      );
    });
  });

  describe('Database Query Performance', () => {
    it('should execute complex queries efficiently', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/analytics/dashboard/overview')
          .set('Authorization', AUTH_TOKEN),
      );

      expect(duration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.dashboard,
      );
    });

    it('should handle filtered queries with joins', async () => {
      const { duration } = await measureExecutionTime(() =>
        request(server)
          .get('/api/v1/reports?type=monthly&year=2024')
          .set('Authorization', AUTH_TOKEN),
      );

      expect(duration).toBeLessThan(
        PERFORMANCE_THRESHOLDS.reports,
      );
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate 10 sequential requests.
      for (let index = 0; index < 10; index++) {
        await request(server).get('/health').expect(200);
      }

      const finalMemory = process.memoryUsage().heapUsed;

      const memoryIncrease =
        (finalMemory - initialMemory) / (1024 * 1024);

      expect(memoryIncrease).toBeLessThan(
        PERFORMANCE_THRESHOLDS.memoryIncrease,
      );
    });
  });
});

// =====================================================
// Performance Benchmarks - Slow Endpoints
// =====================================================

describe('Performance Benchmarks - Slow Endpoints', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    await app.init();

    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  SLOW_ENDPOINTS.forEach(
    ({ method, path, threshold, requiresAuth }) => {
      it(`${method} ${path} should respond within ${threshold}ms`, async () => {
        const start = performance.now();

        const req = request(server)[method.toLowerCase()](path);

        if (requiresAuth) {
          req.set('Authorization', AUTH_TOKEN);
        }

        await req;

        const duration = performance.now() - start;

        if (duration > threshold) {
          console.warn(
            `Slow endpoint detected: ${method} ${path} took ${duration.toFixed(2)}ms`,
          );
        }

        expect(duration).toBeLessThan(threshold);
      });
    },
  );
});
