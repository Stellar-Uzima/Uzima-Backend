import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { testUser } from '../helpers/test-fixtures';
import { CustomValidationPipe } from '../../src/common/pipes/validation.pipe';
import { StandardizedExceptionFilter } from '../../src/common/filters/standardized-exception.filter';

/**
 * Contract test for POST /api/v1/auth/register (#1342).
 * Fails if the response shape for this critical auth flow changes
 * unexpectedly, independent of the fuller e2e suite in auth.e2e-spec.ts.
 */
describe('Auth register contract', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'api/v',
      defaultVersion: '1',
    });
    app.useGlobalPipes(new CustomValidationPipe());
    app.useGlobalFilters(new StandardizedExceptionFilter());
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('response body matches the expected contract shape', async () => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ ...testUser, email: `contract-${Date.now()}@example.com` });

    expect([200, 201]).toContain(res.status);
    expect(res.body).toEqual(
      expect.objectContaining({
        user: expect.any(Object),
      }),
    );
  });

  it('versioned validation failures use the documented error envelope', async () => {
    const res = await request(server).post('/api/v1/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: expect.any(String),
        statusCode: 400,
        details: expect.any(Object),
        path: '/api/v1/auth/register',
        method: 'POST',
        timestamp: expect.any(String),
      }),
    });
  });
});
