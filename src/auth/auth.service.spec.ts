import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { OtpService } from '../otp/otp.service';
import { Role } from './enums/role.enum';

const mockRedisClient = {
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: () => mockRedisClient,
}));

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    // usersRepository is accessed directly in AuthService.verifyEmail
    usersRepository: {
      findOne: jest.fn(),
    },
    // save is called to persist the updated user
    save: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const mockOtpService = {
    generateOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };
  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: OtpService, useValue: mockOtpService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should return 409-style conflict when email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'existing-id',
        email: 'user@example.com',
      });

      await expect(
        service.register({
          email: 'USER@EXAMPLE.COM',
          password: 'password12',
          name: 'Test User',
          country: 'US',
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.register({
          email: 'USER@EXAMPLE.COM',
          password: 'password12',
          name: 'Test User',
          country: 'US',
        }),
      ).rejects.toThrow('An account with this email already exists');

      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should create user and return token when email is new', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'new-id',
        email: 'new@example.com',
      });
      mockJwtService.sign.mockReturnValue('signed-jwt');

      const result = await service.register({
        email: 'new@example.com',
        password: 'password12',
        name: 'New User',
        country: 'KE',
      });

      expect(mockUsersService.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.objectContaining({ userId: 'new-id' }),
      );
      expect(result).toEqual({ token: 'signed-jwt' });
    });
  });

  describe('refresh', () => {
    const userId = 'user-id';
    const tokenId = 'token-id';
    const refreshToken = 'valid-refresh-token';
    const user = {
      id: userId,
      email: 'test@example.com',
      role: Role.USER,
      phoneNumber: '+1234567890',
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should successfully refresh tokens with valid refresh token', async () => {
      const payload = {
        sub: userId,
        tokenId,
        role: Role.USER,
        email: user.email,
      };
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      // Mock JWT verification
      mockJwtService.verify.mockReturnValue(payload);

      // Mock Redis - token exists
      mockRedisClient.get.mockResolvedValue(refreshToken);

      // Mock user lookup
      mockUsersService.findById.mockResolvedValue(user);

      // Mock JWT signing for new tokens
      mockJwtService.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      // Mock Redis delete and set
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.refresh(refreshToken);

      // Verify JWT was verified
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken);

      // Verify old token was retrieved from Redis
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `refresh:${userId}:${tokenId}`,
      );

      // Verify old token was invalidated (deleted)
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `refresh:${userId}:${tokenId}`,
      );

      // Verify user was looked up
      expect(mockUsersService.findById).toHaveBeenCalledWith(userId);

      // Verify new tokens were generated
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);

      // Verify result contains new tokens
      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    });

    it('should verify the payload content of the new access token', async () => {
      const payload = {
        sub: userId,
        tokenId,
        role: Role.USER,
        email: user.email,
      };
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.get.mockResolvedValue(refreshToken);
      mockUsersService.findById.mockResolvedValue(user);
      mockJwtService.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.set.mockResolvedValue('OK');

      await service.refresh(refreshToken);

      // Verify the new access token contains correct payload
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          email: user.email,
          role: Role.USER,
        },
        { expiresIn: '15m' },
      );

      // Verify the new refresh token contains tokenId for rotation
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: userId,
          email: user.email,
          role: Role.USER,
          tokenId: expect.any(String),
        }),
        { expiresIn: '7d' },
      );
    });

    it('should invalidate old refresh token immediately after use', async () => {
      const payload = { sub: userId, tokenId, role: Role.USER };
      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.get.mockResolvedValue(refreshToken);
      mockUsersService.findById.mockResolvedValue(user);
      mockJwtService.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.set.mockResolvedValue('OK');

      await service.refresh(refreshToken);

      // Verify the order: get token, then delete it (rotation)
      const callOrder = mockRedisClient.get.mock.invocationCallOrder[0];
      const deleteOrder = mockRedisClient.del.mock.invocationCallOrder[0];

      expect(deleteOrder).toBeGreaterThan(callOrder);
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `refresh:${userId}:${tokenId}`,
      );
    });

    it('should throw UnauthorizedException when refresh token is expired', async () => {
      // Mock JWT verify to throw error for expired token
      mockJwtService.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refresh('expired-token')).rejects.toThrow(
        'Invalid refresh token',
      );

      // Verify Redis was not accessed
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token has invalid signature', async () => {
      // Mock JWT verify to throw error for invalid signature
      mockJwtService.verify.mockImplementation(() => {
        const error = new Error('Invalid signature');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      await expect(service.refresh('invalid-signature-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refresh('invalid-signature-token')).rejects.toThrow(
        'Invalid refresh token',
      );

      // Verify Redis was not accessed
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid refresh token format', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refresh('invalid-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should throw UnauthorizedException when refresh token is not found in Redis', async () => {
      const payload = { sub: userId, tokenId, role: Role.USER };

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.get.mockResolvedValue(null); // Token not found
      mockRedisClient.keys.mockResolvedValue([]);

      await expect(service.refresh('unused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refresh('unused-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should detect and reject reused refresh token (replay attack)', async () => {
      const payload = { sub: userId, tokenId, role: Role.USER };

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.get.mockResolvedValue(null); // Already deleted
      mockRedisClient.keys.mockResolvedValue([
        `refresh:${userId}:${tokenId}`,
        `refresh:${userId}:other`,
      ]);
      mockRedisClient.del.mockResolvedValue(2);

      await expect(service.refresh('used-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify suspicious activity was reported
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'auth.suspicious_activity',
        {
          userId,
          reason: 'Invalid or reused refresh token',
        },
      );

      // Verify all user sessions were cleared
      expect(mockRedisClient.keys).toHaveBeenCalledWith(`refresh:${userId}:*`);
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        `refresh:${userId}:${tokenId}`,
        `refresh:${userId}:other`,
      ]);
    });

    it('should handle malformed JWT payload gracefully', async () => {
      // Mock returns malformed payload without required fields
      mockJwtService.verify.mockReturnValue({ invalid: 'payload' });
      mockRedisClient.get.mockResolvedValue(refreshToken);

      await expect(service.refresh('malformed-token')).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should delete refresh token', async () => {
      const userId = 'user-id';
      const tokenId = 'token-id';
      const refreshToken = 'refresh-token';
      const payload = { sub: userId, tokenId };

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.del.mockResolvedValue(1);

      await service.logout(refreshToken);

      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken);
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `refresh:${userId}:${tokenId}`,
      );
    });

    it('should not throw on invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid');
      });

      await expect(service.logout('invalid')).resolves.not.toThrow();
    });
  });

  describe('verifyEmail', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should verify email successfully', async () => {
      const token = 'verify-token-123';
      const user = {
        id: 'user-id-verify',
        email: 'verify@example.com',
        emailVerificationToken: token,
        emailVerificationExpiry: new Date(Date.now() + 10000),
        isVerified: false,
      } as any;

      // Mock repository lookup and save
      mockUsersService.usersRepository.findOne.mockResolvedValue(user);

      let savedUser: any = null;
      mockUsersService.save.mockImplementation(async (u: any) => {
        savedUser = u;
        return u;
      });

      const result = await service.verifyEmail({ token } as any);

      // Ensure findOne was called for the verification token
      expect(mockUsersService.usersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailVerificationToken: token,
          }),
        }),
      );

      // Service should return success message
      expect(result).toEqual({ message: 'Email verified successfully' });

      // Ensure save was called and the user was marked verified and tokens cleared
      expect(mockUsersService.save).toHaveBeenCalled();
      expect(savedUser).toEqual(
        expect.objectContaining({
          isVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        }),
      );
    });
  });
});
