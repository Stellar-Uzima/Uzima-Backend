import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PreferencesService } from './services/preferences.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;

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
    };

    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerDeviceToken', () => {
    it('should throw BadRequestException if token is empty', async () => {
      await expect(service.registerDeviceToken('user-id', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should register a device token successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockImplementation(async (user: any) => user);

      const result = await service.registerDeviceToken('user-id', 'new-token');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ fcmToken: 'new-token' }),
      );
      expect(result.fcmToken).toBe('new-token');
    });

    it('should throw NotFoundException if user is not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.registerDeviceToken('user-id', 'token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates user profile fields', async () => {
      const user = {
        id: 'user-1',
        name: 'Old Name',
        phone: '111111111',
        address: 'Old Address',
      };

      userRepository.findOne.mockResolvedValue(user as any);
      userRepository.save.mockResolvedValue({
        ...user,
        name: 'New Name',
      } as any);

      const result = await service.updateProfile('user-1', {
        name: 'New Name',
      } as any);

      expect((result as any).name).toBe('New Name');
    });

    it('throws when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.updateProfile('missing-user', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
