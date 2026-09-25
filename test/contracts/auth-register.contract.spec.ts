import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { testUser } from '../helpers/test-fixtures';

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
});
