import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EMAIL_NOT_VERIFIED_CODE } from './guards/verified-email.guard';

// See auth.controller.registration.spec.ts: the real service is not needed to
// check which requests are allowed to reach it.
jest.mock('./services/auth.service', () => ({ AuthService: class AuthService {} }));

/** Stands in for the passport guard: marks the request as authenticated. */
const authenticatedAs = (userId: string): CanActivate => ({
  canActivate: (context: ExecutionContext) => {
    context.switchToHttp().getRequest().user = { userId, sub: userId };
    return true;
  },
});

describe('verified identity is required for sensitive account actions (#1467)', () => {
  let app: INestApplication;
  const authService = {
    enableTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
    updateProfile: jest.fn(),
  };
  const usersService = { findById: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticatedAs('u1'))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    Object.values(authService).forEach((fn) => fn.mockReset().mockResolvedValue({ ok: true }));
    usersService.findById.mockReset();
  });

  const protectedRoutes: Array<[string, 'post' | 'patch', string, keyof typeof authService]> = [
    ['enable two-factor', 'post', '/auth/2fa/enable', 'enableTwoFactor'],
    ['disable two-factor', 'post', '/auth/2fa/disable', 'disableTwoFactor'],
    ['update the profile', 'patch', '/auth/profile', 'updateProfile'],
  ];

  describe.each(protectedRoutes)('%s', (_label, method, path, handler) => {
    it('is refused for an unverified account', async () => {
      usersService.findById.mockResolvedValue({ id: 'u1', isVerified: false });

      const res = await request(app.getHttpServer())[method](path).send({ code: '123456' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(EMAIL_NOT_VERIFIED_CODE);
      expect(authService[handler]).not.toHaveBeenCalled();
    });

    it('is allowed for a verified account', async () => {
      usersService.findById.mockResolvedValue({ id: 'u1', isVerified: true });

      const res = await request(app.getHttpServer())[method](path).send({ code: '123456' });

      expect(res.status).toBeLessThan(300);
      expect(authService[handler]).toHaveBeenCalledTimes(1);
    });
  });
});
