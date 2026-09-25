import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Signup -> Login user journey (e2e)', () => {
  let app: INestApplication;
  let server: any;

  const journeyUser = {
    email: `journey-${Date.now()}@example.com`,
    password: 'JourneyPass123!',
    name: 'Journey Tester',
  };

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

  it('exercises the full signup -> login flow end-to-end', async () => {
    const signupRes = await request(server).post('/api/v1/auth/register').send(journeyUser);
    expect(signupRes.status).toBe(201);
    expect(signupRes.body).toHaveProperty('accessToken');

    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: journeyUser.email, password: journeyUser.password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body.user.email).toBe(journeyUser.email);
  });
});
