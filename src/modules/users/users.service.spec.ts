import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator, Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PreferencesService } from './services/preferences.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let userStatusLogRepository: jest.Mocked<Repository<UserStatusLog>>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    fullName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    fcmToken: null as any,
    preferredLanguage: 'en',
    country: 'US',
    phoneNumber: '+1234567890',
  } as any;

  beforeEach(async () => {
    const mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockUserStatusLogRepository = {
      save: jest.fn(),
      delete: jest.fn(),
    };

    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockPreferencesService = {
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(UserStatusLog),
          useValue: mockUserStatusLogRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: PreferencesService,
          useValue: mockPreferencesService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User));
    userStatusLogRepository = module.get(getRepositoryToken(UserStatusLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerDeviceToken', () => {
    it('should throw BadRequestException if token is empty', async () => {
      await expect(service.registerDeviceToken('user-id', '')).rejects.toThrow(BadRequestException);
    });

    it('should register a device token successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockImplementation(async (user: any) => user);

      const result = await service.registerDeviceToken('user-id', 'new-token');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ fcmToken: 'new-token' })
      );
      expect(result.fcmToken).toBe('new-token');
    });

    it('should throw NotFoundException if user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.registerDeviceToken('user-id', 'token')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('cleanupOldStatusLogs', () => {
    it('should delete only logs older than the retention period', async () => {
      const retentionDays = 90;
      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - retentionDays);

      userStatusLogRepository.delete.mockResolvedValue({ affected: 3 } as any);

      const result = await service.cleanupOldStatusLogs(retentionDays);

      expect(userStatusLogRepository.delete).toHaveBeenCalledTimes(1);
      const whereArg = userStatusLogRepository.delete.mock.calls[0][0] as {
        createdAt: FindOperator<Date>;
      };
      expect(Object.keys(whereArg)).toEqual(['createdAt']);
      expect(whereArg.createdAt).toBeInstanceOf(FindOperator);
      expect(whereArg.createdAt.type).toBe('lessThan');
      const cutoff = whereArg.createdAt.value as Date;
      expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(2000);
      expect(result).toBe(3);
    });

    it('should never touch records newer than the retention period', async () => {
      userStatusLogRepository.delete.mockResolvedValue({ affected: 0 } as any);

      await service.cleanupOldStatusLogs(30);

      const whereArg = userStatusLogRepository.delete.mock.calls[0][0] as {
        createdAt: FindOperator<Date>;
      };
      // A single, strictly-less-than cutoff: rows at/after the cutoff are excluded.
      expect(Object.keys(whereArg)).toEqual(['createdAt']);
      expect(whereArg.createdAt).toBeInstanceOf(FindOperator);
      expect(whereArg.createdAt.type).toBe('lessThan');
    });

    it('should return the number of deleted records', async () => {
      userStatusLogRepository.delete.mockResolvedValue({ affected: 7 } as any);

      await expect(service.cleanupOldStatusLogs(90)).resolves.toBe(7);
    });

    it('should return 0 when affected count is undefined', async () => {
      userStatusLogRepository.delete.mockResolvedValue({} as any);

      await expect(service.cleanupOldStatusLogs(90)).resolves.toBe(0);
    });
  });

  describe('updateProfile', () => {
    it('updates user profile fields', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Old',
        lastName: 'Name',
        fullName: 'Old Name',
        phoneNumber: '111111111',
        address: 'Old Address',
        walletAddress: null,
        referralCode: null,
        preferredLanguage: 'en',
        country: 'US',
      } as any;

      userRepository.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce({
        ...user,
        firstName: 'New',
        fullName: 'New Name',
      } as any);

      userRepository.save.mockResolvedValue({
        ...user,
        firstName: 'New',
        fullName: 'New Name',
      } as any);

      const result = await service.updateProfile('user-1', {
        firstName: 'New',
      } as any);

      expect(result.firstName).toBe('New');
      expect(result.fullName).toBe('New Name');
    });

    it('throws when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.updateProfile('missing-user', {} as any)).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
