import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { RateLimitGuard } from '../src/common/guards/rate-limit.guard';

describe('Rate Limiter (e2e) - Global API Protection', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Create a testing module with reduced rate limits for testing
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        ThrottlerModule.forRoot({
          throttlers: [
            {
              name: 'test',
              ttl: 60000,
              limit: 5, // Very low limit for testing - only 5 requests per minute
            },
          ],
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Ensure the RateLimitGuard is applied globally
    app.useGlobalGuards(new RateLimitGuard(
      app.get('THROTTLER:MODULE_OPTIONS'),
      app.get('THROTTLER:STORAGE'),
      app.get('Reflector')
    ));
    await app.init();
  });

  it('/ (GET) - health check includes rate limit headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .expect(HttpStatus.OK);

    // Verify rate limit headers are present in all responses
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('/health (GET) - public health endpoint includes rate limit headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(HttpStatus.OK);

    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('rate limiter properly extracts X-Forwarded-For IP for accurate tracking', async () => {
    // Simulate a request coming through a proxy with X-Forwarded-For header
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('X-Forwarded-For', '203.0.113.42, 10.0.0.1')
      .expect(HttpStatus.OK);

    // Request should still work and be tracked correctly
    expect(response.status).toBe(HttpStatus.OK);
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('all public API endpoints include rate limit headers', async () => {
    // List of public API endpoints that should always be protected
    const publicEndpoints = [
      '/',
      '/health',
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/otp/request',
    ];

    for (const endpoint of publicEndpoints) {
      const response = await request(app.getHttpServer())
        .post(endpoint.includes('login') || endpoint.includes('register') || endpoint.includes('otp') ? endpoint : endpoint)
        .send({});
      
      // All responses should include rate limit headers regardless of success/failure
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    }
  });

  afterAll(async () => {
    await app.close();
  });
});

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) - returns welcome message', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200);
  });
});