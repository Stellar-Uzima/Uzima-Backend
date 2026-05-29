import { Test, TestingModule } from '@nestjs/testing';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { authenticator } from 'otplib';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../auth/services/auth.service';
import { UsersService } from '../../auth/services/users.service';
import { OtpService } from '../../otp/otp.service';
import { AuditService } from '../../audit/audit.service';
import { EmailVerificationService } from './services/email-verification.service';
import { SessionService } from './services/session.service';
import { TransactionService } from '../../database/services/transaction.service';
import { TokenBlacklist } from '../../database/entities/token-blacklist.entity';
import { AccountLockedException } from '../../auth/exceptions/account-locked.exception';
import { Role } from '../../auth/enums/role.enum';

const mockRedisClient = {
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  incr: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: () => mockRedisClient,
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr'),
}));

describe('AuthService', () => {
  let authService: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    getProfile: jest.fn(),
    canUserLogin: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };
  const mockOtpService = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };
  const mockAuditService = { logAction: jest.fn() };
  const mockEmailVerificationService = { createForUser: jest.fn(), consume: jest.fn() };
  const mockSessionService = { createSession: jest.fn(), revokeSession: jest.fn() };
  const mockTransactionService = { execute: jest.fn() };
  const mockTokenBlacklistRepository = { save: jest.fn(), findOne: jest.fn(), delete: jest.fn() };

  const baseUser = {
    id: 'user-1',
    email: 'user@example.com',
    password: 'hashed-password',
    role: Role.USER,
    isVerified: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.compare as jest.Mock).mockReset();
    process.env.MAX_FAILED_LOGIN_ATTEMPTS = '5';
    process.env.ACCOUNT_LOCKOUT_DURATION_MS = '900000';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: OtpService, useValue: mockOtpService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EmailVerificationService, useValue: mockEmailVerificationService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: TransactionService, useValue: mockTransactionService },
        { provide: getRepositoryToken(TokenBlacklist), useValue: mockTokenBlacklistRepository },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('account lockout', () => {
    const loginDto = { email: 'user@example.com', password: 'WrongPassword1!' };

    it('locks account after 5 failed login attempts', async () => {
      let attempts = 0;
      mockUsersService.findByEmail.mockImplementation(async () => ({
        ...baseUser,
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= 5 ? new Date(Date.now() + 900000) : null,
      }));
      mockUsersService.findById.mockImplementation(async () => mockUsersService.findByEmail());
      mockUsersService.save.mockImplementation(async (user) => {
        attempts = user.failedLoginAttempts;
        return user;
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      for (let i = 0; i < 4; i += 1) {
        await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      }

      await expect(authService.login(loginDto)).rejects.toThrow(AccountLockedException);
    });

    it('returns 423 with unlock time when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 600000);
      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        lockedUntil,
      });

      try {
        await authService.login({ email: baseUser.email, password: 'any' });
        fail('Expected AccountLockedException');
      } catch (error) {
        expect(error).toBeInstanceOf(AccountLockedException);
        expect((error as AccountLockedException).getStatus()).toBe(423);
        expect((error as AccountLockedException).getResponse()).toMatchObject({
          statusCode: 423,
          lockedUntil: lockedUntil.toISOString(),
        });
      }
    });

    it('resets failed attempt counter on successful login', async () => {
      const user = {
        ...baseUser,
        failedLoginAttempts: 2,
        lockedUntil: null,
        refreshToken: null,
        refreshTokenExpiry: null,
      };
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockUsersService.canUserLogin.mockResolvedValue({ canLogin: true });
      mockUsersService.getProfile.mockResolvedValue({ id: user.id, email: user.email });
      mockUsersService.findById.mockResolvedValue(user);
      mockUsersService.save.mockImplementation(async (u) => u);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('token');
      mockRedisClient.set.mockResolvedValue('OK');
      mockSessionService.createSession.mockResolvedValue({});

      await authService.login({ email: user.email, password: 'ValidPass1!' });

      expect(mockUsersService.save).toHaveBeenCalledWith(
        expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
      );
    });
  });

  describe('refresh token rotation', () => {
    const userId = 'user-1';
    const tokenId = 'token-id-abc';
    const refreshToken = 'valid-refresh-token';

    it('returns new access and refresh tokens on valid refresh', async () => {
      mockJwtService.verify.mockReturnValue({ sub: userId, tokenId });
      mockTokenBlacklistRepository.findOne.mockResolvedValue(null);
      mockRedisClient.get.mockResolvedValue(refreshToken);
      const user = {
        ...baseUser,
        refreshToken: 'hashed',
        refreshTokenExpiry: new Date(Date.now() + 86400000),
      };
      mockUsersService.findById.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRedisClient.del.mockResolvedValue(1);
      mockUsersService.save.mockImplementation(async (u) => u);
      mockJwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      mockRedisClient.set.mockResolvedValue('OK');
      mockSessionService.createSession.mockResolvedValue({});

      const result = await authService.refresh(refreshToken);

      expect(result).toEqual({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
    });

    it('invalidates old refresh token after use (rotation)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: userId, tokenId });
      mockTokenBlacklistRepository.findOne.mockResolvedValue(null);
      mockRedisClient.get.mockResolvedValue(refreshToken);
      const user = {
        ...baseUser,
        refreshToken: 'hashed',
        refreshTokenExpiry: new Date(Date.now() + 86400000),
      };
      mockUsersService.findById.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRedisClient.del.mockResolvedValue(1);
      mockUsersService.save.mockImplementation(async (u) => u);
      mockJwtService.sign.mockReturnValue('new-token');
      mockRedisClient.set.mockResolvedValue('OK');
      mockSessionService.createSession.mockResolvedValue({});

      await authService.refresh(refreshToken);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`refresh:${userId}:${tokenId}`);
      expect(mockUsersService.save).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: null, refreshTokenExpiry: null }),
      );
    });

    it('returns 401 when reusing an old (already rotated) refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: userId, tokenId });
      mockTokenBlacklistRepository.findOne.mockResolvedValue(null);
      mockRedisClient.get.mockResolvedValue(null); // not in Redis → already rotated
      mockRedisClient.keys.mockResolvedValue([]);
      mockUsersService.findById.mockResolvedValue({ ...baseUser, refreshToken: null, refreshTokenExpiry: null });
      mockUsersService.save.mockImplementation(async (u) => u);

      await expect(authService.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('emits suspicious_activity event on replay attack', async () => {
      mockJwtService.verify.mockReturnValue({ sub: userId, tokenId });
      mockTokenBlacklistRepository.findOne.mockResolvedValue(null);
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.keys.mockResolvedValue([]);
      mockUsersService.findById.mockResolvedValue({ ...baseUser, refreshToken: null, refreshTokenExpiry: null });
      mockUsersService.save.mockImplementation(async (u) => u);

      await expect(authService.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'auth.suspicious_activity',
        expect.objectContaining({ userId, reason: expect.stringContaining('reused') }),
      );
    });

    it('returns 401 when refresh token is blacklisted', async () => {
      mockJwtService.verify.mockReturnValue({ sub: userId, tokenId });
      mockTokenBlacklistRepository.findOne.mockResolvedValue({ token: refreshToken });

      await expect(authService.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('two-factor authentication', () => {
    it('enableTwoFactor returns QR code and secret', async () => {
      mockUsersService.findById.mockResolvedValue({ ...baseUser });
      mockUsersService.save.mockImplementation(async (u) => u);

      const result = await authService.enableTwoFactor(baseUser.id);

      expect(result.secret).toBeDefined();
      expect(result.qrCode).toContain('data:image');
      expect(result.enabled).toBe(false);
    });

    it('disableTwoFactor disables 2FA after valid verification', async () => {
      const secret = authenticator.generateSecret();
      const code = authenticator.generate(secret);
      mockUsersService.findById.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: secret,
      });
      mockUsersService.save.mockImplementation(async (u) => u);

      const result = await authService.disableTwoFactor(baseUser.id, code);

      expect(result.message).toContain('disabled');
      expect(mockUsersService.save).toHaveBeenCalledWith(
        expect.objectContaining({ twoFactorEnabled: false, twoFactorSecret: null }),
      );
    });

    it('login requires TOTP when 2FA is enabled', async () => {
      const secret = authenticator.generateSecret();
      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: true,
        twoFactorSecret: secret,
      });
      mockUsersService.canUserLogin.mockResolvedValue({ canLogin: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.login({ email: baseUser.email, password: 'ValidPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('login succeeds with valid TOTP when 2FA is enabled', async () => {
      const secret = authenticator.generateSecret();
      const totpCode = authenticator.generate(secret);
      mockUsersService.findByEmail.mockResolvedValue({
        ...baseUser,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: true,
        twoFactorSecret: secret,
      });
      mockUsersService.canUserLogin.mockResolvedValue({ canLogin: true });
      mockUsersService.getProfile.mockResolvedValue({ id: baseUser.id });
      mockUsersService.save.mockImplementation(async (u) => u);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('token');
      mockRedisClient.set.mockResolvedValue('OK');
      mockSessionService.createSession.mockResolvedValue({});

      const result = await authService.login({
        email: baseUser.email,
        password: 'ValidPass1!',
        totpCode,
      });

      expect(result.accessToken).toBeDefined();
    });
  });

  describe('register', () => {
    it('throws ConflictException when email exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        authService.register({
          email: 'taken@example.com',
          password: 'Password123!',
          name: 'Test',
          country: 'KE',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
