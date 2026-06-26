import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { testUser } from './helpers/test-fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let server: any;

  let refreshToken: string;

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

  it('POST /api/v1/auth/register -> 201', async () => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('POST /api/v1/auth/register -> 409 for duplicate email', async () => {
    await request(server).post('/api/v1/auth/register').send(testUser).expect(409);
  });

  it('POST /api/v1/auth/login -> 200 with valid credentials', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    refreshToken = res.body.refreshToken;
  });

  it('POST /api/v1/auth/login -> 401 with invalid credentials', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: 'wrong-password' })
      .expect(401);
  });

  it('POST /api/v1/auth/refresh -> 200 with valid refresh token (Authorization Bearer)', async () => {
    const res = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('POST /api/v1/auth/refresh -> 401 with invalid refresh token', async () => {
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);
  });

  it('POST /api/v1/auth/logout -> 200 with refresh token in Authorization header', async () => {
    // get a fresh refresh token by logging in again
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    const rt = login.body.refreshToken;

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rt}`)
      .expect(200);
  });
});
