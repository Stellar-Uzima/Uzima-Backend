import { BadRequestException, GoneException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthEventType } from '../../../database/entities/auth-event.entity';
import { TooManyRequestsException } from '../exceptions/too-many-requests.exception';
import { AuthService } from './auth.service';

const mockRedis = {
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
};

jest.mock('redis', () => ({ createClient: () => mockRedis }));

// referral-reward-settlement.service.ts has a syntax error on main, and it is
// imported (through ReferralService) by AuthService. Nothing here exercises
// referrals, so a stand-in keeps this suite independent of that file.
jest.mock('../../../referral/referral.service', () => ({ ReferralService: class ReferralService {} }));

// audit/services/auth-event-audit.service.ts has a syntax error on main (lines
// 317 and 327), and AuthService imports it. Every test here injects its own
// fake audit service, so the real class is never needed.
jest.mock('../../../audit/services/auth-event-audit.service', () => ({
  AuthEventAuditService: class AuthEventAuditService {},
}));

function build() {
  const usersService = {
    findByEmail: jest.fn(),
    canUserLogin: jest.fn().mockResolvedValue({ canLogin: true }),
    updateLastLogin: jest.fn(),
    save: jest.fn().mockImplementation(async (user) => user),
    findByPasswordResetToken: jest.fn(),
    applyPasswordReset: jest.fn(),
  };
  const emailVerificationService = { consume: jest.fn(), createForUser: jest.fn() };
  const auditService = { logEvent: jest.fn(), logAction: jest.fn() };
  const authEventAudit = { record: jest.fn().mockResolvedValue(null) };
  const notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const passwordPolicy = { assert: jest.fn() };
  const lockout = { assertNotLocked: jest.fn(), clear: jest.fn(), recordIpFailure: jest.fn() };
  const loginThrottle = {
    assertAllowed: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    clearIdentity: jest.fn().mockResolvedValue(undefined),
  };
  const eventEmitter = { emit: jest.fn() };
  const configService = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };

  const service = new AuthService(
    usersService as never,
    {} as never, // jwtService
    eventEmitter as never,
    {} as never, // otpService
    auditService as never,
    emailVerificationService as never,
    {} as never, // sessionService
    {} as never, // transactionService
    {} as never, // tokenBlacklistRepo
    notifications as never,
    configService as never,
    passwordPolicy as never,
    lockout as never,
    loginThrottle as never,
    authEventAudit as never,
  );

  return {
    service,
    usersService,
    emailVerificationService,
    auditService,
    authEventAudit,
    notifications,
    passwordPolicy,
    lockout,
    eventEmitter,
  };
}

beforeEach(() => {
  Object.values(mockRedis).forEach((fn) => fn.mockReset());
  mockRedis.get.mockResolvedValue(null);
  mockRedis.keys.mockResolvedValue([]);
});

describe('AuthService email verification (#1467)', () => {
  describe('login', () => {
    const password = 'S3cureP@ssw0rd';
    const unverifiedUser = () => ({
      id: 'u1',
      email: 'ada@example.com',
      role: 'patient',
      password: bcrypt.hashSync(password, 4),
      isVerified: false,
    });

    it('refuses an unverified account with a 401 instead of crashing', async () => {
      const { service, usersService } = build();
      usersService.findByEmail.mockResolvedValue(unverifiedUser());

      await expect(service.login({ email: 'ada@example.com', password } as never)).rejects.toThrow(
        new UnauthorizedException('Email not verified'),
      );
      expect(usersService.updateLastLogin).not.toHaveBeenCalled();
    });

    it('records the request details of the blocked attempt', async () => {
      const { service, usersService, auditService } = build();
      usersService.findByEmail.mockResolvedValue(unverifiedUser());

      await expect(
        service.login({ email: 'ada@example.com', password } as never, '10.0.0.1', {
          ip: '10.0.0.1',
          headers: { 'user-agent': 'jest' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          ipAddress: '10.0.0.1',
          userAgent: 'jest',
          metadata: { reason: 'email_not_verified' },
        }),
      );
    });
  });

  describe('verifyEmail', () => {
    it('marks the account verified and finishes without error', async () => {
      const { service, usersService, emailVerificationService, authEventAudit, eventEmitter } = build();
      const user = { id: 'u1', email: 'ada@example.com', isVerified: false };
      emailVerificationService.consume.mockResolvedValue({ status: 'OK', record: { user } });

      const result = await service.verifyEmail({ token: 'a'.repeat(64) });

      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(usersService.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', isVerified: true }));
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.email.verified', expect.objectContaining({ userId: 'u1' }));
      expect(authEventAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: AuthEventType.EMAIL_VERIFICATION, userId: 'u1' }),
      );
    });

    it('still verifies the account when the audit trail is unavailable', async () => {
      const { service, usersService, emailVerificationService, authEventAudit } = build();
      const user = { id: 'u1', email: 'ada@example.com', isVerified: false };
      emailVerificationService.consume.mockResolvedValue({ status: 'OK', record: { user } });
      authEventAudit.record.mockRejectedValue(new Error('audit db down'));

      await expect(service.verifyEmail({ token: 'a'.repeat(64) })).resolves.toEqual({
        message: 'Email verified successfully',
      });
      expect(usersService.save).toHaveBeenCalled();
    });

    it('answers 410 for an expired token', async () => {
      const { service, emailVerificationService } = build();
      emailVerificationService.consume.mockResolvedValue({ status: 'EXPIRED', record: {} });

      await expect(service.verifyEmail({ token: 'a'.repeat(64) })).rejects.toBeInstanceOf(GoneException);
    });

    it('answers 400 for a token that was already used', async () => {
      const { service, usersService, emailVerificationService } = build();
      emailVerificationService.consume.mockResolvedValue({ status: 'ALREADY_USED', record: {} });

      await expect(service.verifyEmail({ token: 'a'.repeat(64) })).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.save).not.toHaveBeenCalled();
    });
  });

  describe('resendEmailVerification', () => {
    it('answers 429 once the hourly limit is reached', async () => {
      const { service, usersService, emailVerificationService } = build();
      usersService.findByEmail.mockResolvedValue({ id: 'u1', email: 'ada@example.com', isVerified: false });
      mockRedis.get.mockResolvedValue('3');

      const attempt = service.resendEmailVerification({ email: 'ada@example.com' });

      await expect(attempt).rejects.toBeInstanceOf(TooManyRequestsException);
      await expect(attempt).rejects.toMatchObject({ status: 429 });
      expect(emailVerificationService.createForUser).not.toHaveBeenCalled();
    });

    it('gives the same answer for an unknown address as for a real one', async () => {
      const { service, usersService, emailVerificationService } = build();
      usersService.findByEmail.mockResolvedValue(null);

      const unknown = await service.resendEmailVerification({ email: 'nobody@example.com' });

      usersService.findByEmail.mockResolvedValue({ id: 'u1', email: 'ada@example.com', isVerified: false });
      const known = await service.resendEmailVerification({ email: 'ada@example.com' });

      expect(unknown).toEqual(known);
      expect(emailVerificationService.createForUser).toHaveBeenCalledTimes(1);
    });
  });
});
