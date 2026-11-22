import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomValidationPipe } from '../../common/pipes/validation.pipe';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// The real service pulls in Redis, TypeORM and half the application. These
// tests only care about what happens before it is reached.
jest.mock('./services/auth.service', () => ({ AuthService: class AuthService {} }));

const validBody = () => ({
  email: 'jane.doe@example.com',
  password: 'S3cureP@ssw0rd!',
  firstName: 'Jane',
  lastName: 'Doe',
  country: 'NG',
});

describe('POST /auth/register input rules', () => {
  let app: INestApplication;
  const authService = { register: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Same global pipe that main.ts registers.
    app.useGlobalPipes(new CustomValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    authService.register.mockReset();
    authService.register.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
  });

  const register = (body: unknown) => request(app.getHttpServer()).post('/auth/register').send(body as object);

  it('rejects an invalid email with an error on the email field', async () => {
    const res = await register({ ...validBody(), email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(['email']);
    expect(res.body.errors.email).toContain('Invalid email format');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects a missing password with an error on the password field', async () => {
    const { password: _password, ...body } = validBody();
    const res = await register(body);

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty('password');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects a weak password with an error on the password field', async () => {
    const res = await register({ ...validBody(), password: 'abcdefgh1' });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(['password']);
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects a password that is too short', async () => {
    const res = await register({ ...validBody(), password: 'Aa1!' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty('password');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('names every required field that is missing', async () => {
    const res = await register({});

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(
      expect.arrayContaining(['email', 'password', 'firstName', 'lastName', 'country']),
    );
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects fields the DTO does not define', async () => {
    const res = await register({ ...validBody(), role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('passes a valid request through to the service exactly once', async () => {
    const res = await register(validBody());

    expect(res.status).toBe(201);
    expect(authService.register).toHaveBeenCalledTimes(1);
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane.doe@example.com', country: 'NG' }),
    );
  });
});
