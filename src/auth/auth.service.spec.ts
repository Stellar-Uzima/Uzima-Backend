import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
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

  describe('refresh', () => {
    it('should successfully refresh tokens', async () => {
      const userId = 'user-id';
      const tokenId = 'token-id';
      const refreshToken = 'valid-refresh-token';
      const payload = { sub: userId, tokenId, role: Role.USER };
      const user = { id: userId, email: 'test@example.com', role: Role.USER };

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.get.mockResolvedValue(refreshToken);
      mockUsersService.findById.mockResolvedValue(user);
      mockJwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.refresh(refreshToken);

      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`refresh:${userId}:${tokenId}`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`refresh:${userId}:${tokenId}`);
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw error on invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refresh('invalid-token')).rejects.toThrow('Invalid refresh token');
    });

    it('should handle replay attack by clearing all user sessions', async () => {
      const userId = 'user-id';
      const tokenId = 'token-id';
      const payload = { sub: userId, tokenId, role: Role.USER };

      mockJwtService.verify.mockReturnValue(payload);
      mockRedisClient.get.mockResolvedValue(null); // Token not found
      mockRedisClient.keys.mockResolvedValue([`refresh:${userId}:${tokenId}`, `refresh:${userId}:other`]);
      mockRedisClient.del.mockResolvedValue(2);

      await expect(service.refresh('used-token')).rejects.toThrow('Invalid refresh token');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('auth.suspicious_activity', {
        userId,
        reason: 'Invalid or reused refresh token',
      });
      expect(mockRedisClient.keys).toHaveBeenCalledWith(`refresh:${userId}:*`);
      expect(mockRedisClient.del).toHaveBeenCalledWith([`refresh:${userId}:${tokenId}`, `refresh:${userId}:other`]);
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
      expect(mockRedisClient.del).toHaveBeenCalledWith(`refresh:${userId}:${tokenId}`);
    });

    it('should not throw on invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid');
      });

      await expect(service.logout('invalid')).resolves.not.toThrow();
    });
  });
});
