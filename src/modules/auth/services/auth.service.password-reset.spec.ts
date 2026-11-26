import { BadRequestException, GoneException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthEventOutcome, AuthEventType } from '../../../database/entities/auth-event.entity';
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

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

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

describe('AuthService password reset (#1468)', () => {
  const context = { ipAddress: '10.0.0.9', userAgent: 'jest', requestId: 'req-1' };

  describe('forgotPassword', () => {
    it('stores only a hash of the token that is emailed to the user', async () => {
      const { service, usersService, notifications } = build();
      const user: Record<string, any> = { id: 'u1', email: 'ada@example.com', firstName: 'Ada' };
      usersService.findByEmail.mockResolvedValue(user);

      await service.forgotPassword('ada@example.com', '10.0.0.9', context);

      const link: string = notifications.sendEmail.mock.calls[0][2].link;
      const emailedToken = new URL(link).searchParams.get('token') as string;

      expect(emailedToken).toMatch(/^[a-f0-9]{64}$/);
      expect(user.passwordResetToken).toBe(sha256(emailedToken));
      expect(user.passwordResetToken).not.toBe(emailedToken);
    });

    it('gives the token a one hour lifetime', async () => {
      const { service, usersService } = build();
      const user: Record<string, any> = { id: 'u1', email: 'ada@example.com' };
      usersService.findByEmail.mockResolvedValue(user);

      const before = Date.now();
      await service.forgotPassword('ada@example.com');

      const lifetime = (user.passwordResetExpiry as Date).getTime() - before;
      expect(lifetime).toBeGreaterThan(59 * 60 * 1000);
      expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
    });

    it('does not sign anyone out just because a reset was requested', async () => {
      const { service, usersService } = build();
      usersService.findByEmail.mockResolvedValue({ id: 'u1', email: 'ada@example.com' });

      await service.forgotPassword('ada@example.com');

      // Requesting a reset needs no authentication, so it must not touch sessions.
      expect(mockRedis.keys).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('records the request with its context', async () => {
      const { service, usersService, authEventAudit } = build();
      usersService.findByEmail.mockResolvedValue({ id: 'u1', email: 'ada@example.com' });

      await service.forgotPassword('ada@example.com', '10.0.0.9', context);

      expect(authEventAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthEventType.PASSWORD_RESET_REQUESTED,
          ipAddress: '10.0.0.9',
          userAgent: 'jest',
          requestId: 'req-1',
        }),
      );
    });

    it('answers the same for an unknown address and sends nothing', async () => {
      const { service, usersService, notifications } = build();
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result).toEqual({ message: 'If an account exists, a reset link has been sent' });
      expect(usersService.save).not.toHaveBeenCalled();
      expect(notifications.sendEmail).not.toHaveBeenCalled();
    });

    it('answers 429 after three requests for one address', async () => {
      const { service, usersService } = build();
      mockRedis.get.mockResolvedValue('3');

      await expect(service.forgotPassword('ada@example.com')).rejects.toBeInstanceOf(TooManyRequestsException);
      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const token = 'b'.repeat(64);
    const liveUser = () => ({
      id: 'u1',
      email: 'ada@example.com',
      role: 'patient',
      passwordResetToken: sha256(token),
      passwordResetExpiry: new Date(Date.now() + 10 * 60 * 1000),
    });

    it('looks the token up by its hash, never by the raw value', async () => {
      const { service, usersService } = build();
      usersService.findByPasswordResetToken.mockResolvedValue(null);

      await expect(service.resetPassword(token, 'N3wS3cure!Passw0rd')).rejects.toBeInstanceOf(BadRequestException);

      expect(usersService.findByPasswordResetToken).toHaveBeenCalledWith(sha256(token));
    });

    it('stores a bcrypt hash of the new password, not the password', async () => {
      const { service, usersService } = build();
      usersService.findByPasswordResetToken.mockResolvedValue(liveUser());
      usersService.applyPasswordReset.mockResolvedValue(true);

      await service.resetPassword(token, 'N3wS3cure!Passw0rd', context);

      const [userId, tokenHash, storedPassword] = usersService.applyPasswordReset.mock.calls[0];
      expect(userId).toBe('u1');
      expect(tokenHash).toBe(sha256(token));
      expect(storedPassword).not.toBe('N3wS3cure!Passw0rd');
      expect(await bcrypt.compare('N3wS3cure!Passw0rd', storedPassword)).toBe(true);
    });

    it('ends every refresh session when the reset succeeds', async () => {
      const { service, usersService, lockout } = build();
      usersService.findByPasswordResetToken.mockResolvedValue(liveUser());
      usersService.applyPasswordReset.mockResolvedValue(true);
      mockRedis.keys.mockResolvedValue(['refresh:u1:t1', 'refresh:u1:t2']);

      const result = await service.resetPassword(token, 'N3wS3cure!Passw0rd', context);

      expect(result).toEqual({ message: 'Password reset successful' });
      expect(mockRedis.keys).toHaveBeenCalledWith('refresh:u1:*');
      expect(mockRedis.del).toHaveBeenCalledWith(['refresh:u1:t1', 'refresh:u1:t2']);
      expect(lockout.clear).toHaveBeenCalledWith('u1', expect.objectContaining({ cause: 'password_reset' }));
    });

    it('records the completed reset with its context', async () => {
      const { service, usersService, authEventAudit } = build();
      usersService.findByPasswordResetToken.mockResolvedValue(liveUser());
      usersService.applyPasswordReset.mockResolvedValue(true);

      await service.resetPassword(token, 'N3wS3cure!Passw0rd', context);

      expect(authEventAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuthEventType.PASSWORD_RESET_COMPLETED,
          userId: 'u1',
          ipAddress: '10.0.0.9',
        }),
      );
    });

    it('rejects an expired token with 410 and changes nothing', async () => {
      const { service, usersService, authEventAudit } = build();
      usersService.findByPasswordResetToken.mockResolvedValue({
        ...liveUser(),
        passwordResetExpiry: new Date(Date.now() - 1000),
      });

      await expect(service.resetPassword(token, 'N3wS3cure!Passw0rd')).rejects.toBeInstanceOf(GoneException);

      expect(usersService.applyPasswordReset).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(authEventAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: AuthEventOutcome.FAILURE, reason: 'token_expired' }),
      );
    });

    it('rejects the second of two simultaneous uses and leaves sessions alone', async () => {
      const { service, usersService } = build();
      // Both requests found the token, but only the first UPDATE matched a row.
      usersService.findByPasswordResetToken.mockResolvedValue(liveUser());
      usersService.applyPasswordReset.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const results = await Promise.allSettled([
        service.resetPassword(token, 'N3wS3cure!Passw0rd'),
        service.resetPassword(token, 'An0ther!Passw0rd!'),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(BadRequestException);
      expect(mockRedis.keys).toHaveBeenCalledTimes(1);
    });

    it('cannot be used a second time once it has been used', async () => {
      const { service, usersService } = build();
      // A stateful stand-in for the database row.
      let row: ReturnType<typeof liveUser> | null = liveUser();
      usersService.findByPasswordResetToken.mockImplementation(async (hash: string) =>
        row && row.passwordResetToken === hash ? row : null,
      );
      usersService.applyPasswordReset.mockImplementation(async (_id: string, hash: string) => {
        if (row && row.passwordResetToken === hash) {
          row = null; // the token is cleared by the same statement
          return true;
        }
        return false;
      });

      await expect(service.resetPassword(token, 'N3wS3cure!Passw0rd')).resolves.toBeDefined();
      await expect(service.resetPassword(token, 'An0ther!Passw0rd!')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces the password policy before touching any account', async () => {
      const { service, usersService, passwordPolicy } = build();
      passwordPolicy.assert.mockImplementation(() => {
        throw new BadRequestException('weak');
      });

      await expect(service.resetPassword(token, 'weak')).rejects.toBeInstanceOf(BadRequestException);

      expect(usersService.findByPasswordResetToken).not.toHaveBeenCalled();
    });
  });
});
