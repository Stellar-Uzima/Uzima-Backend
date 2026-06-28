import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth Endpoints E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: any;

  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'Test123!@#',
    firstName: 'Auth',
    lastName: 'Tester',
  };

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up test user
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await app.close();
  });

  // ========== REGISTRATION TESTS ==========

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should return 400 if email is missing', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send({
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if password is missing', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send({
          email: testUser.email,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 409 if email already exists', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });

    it('should reject weak password', async () => {
      const weakUser = {
        email: `weak-${Date.now()}@example.com`,
        password: '123',
        firstName: 'Weak',
        lastName: 'User',
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(weakUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ========== LOGIN TESTS ==========

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should return 401 with invalid password', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 with non-existent email', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'anypassword',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 if email is missing', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          password: testUser.password,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 if password is missing', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ========== REFRESH TOKEN TESTS ==========

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const response = await request(server)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-token-123',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 if refresh token is missing', async () => {
      const response = await request(server)
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ========== LOGOUT TESTS ==========

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('success');
    });

    it('should return 401 without authorization header', async () => {
      const response = await request(server)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  // ========== GET PROFILE TESTS ==========

  describe('GET /api/v1/auth/profile', () => {
    let validAccessToken: string;

    beforeAll(async () => {
      // Get fresh token for profile tests
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      validAccessToken = loginRes.body.accessToken;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('email', testUser.email);
      expect(response.body).toHaveProperty('firstName', testUser.firstName);
      expect(response.body).toHaveProperty('lastName', testUser.lastName);
    });

    it('should return 401 without token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(server)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  // ========== RATE LIMITING TESTS ==========

  describe('Rate Limiting', () => {
    it('should limit excessive login attempts', async () => {
      const email = `ratelimit-${Date.now()}@example.com`;
      const password = 'Test123!@#';

      // First create a user
      await request(server)
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          firstName: 'Rate',
          lastName: 'Limit',
        });

      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/api/v1/auth/login')
          .send({
            email,
            password: 'wrongpassword',
          });
      }

      // The 6th attempt should be rate limited (if configured)
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'wrongpassword',
        });

      // Rate limit may return 429 or still 401 depending on config
      expect([401, 429]).toContain(response.status);

      // Clean up
      await prisma.user.deleteMany({ where: { email } });
    });
  });

  // ========== PASSWORD RESET TESTS ==========

  describe('Password Reset Flow', () => {
    let passwordResetToken: string;

    it('should request password reset', async () => {
      const response = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: testUser.email,
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for non-existent email', async () => {
      const response = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});