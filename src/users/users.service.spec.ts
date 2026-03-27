import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserStatsDto } from './dto/user-stats.dto';
import { Role } from './enums/role.enum';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    fullName: 'Test User',
    phoneNumber: '+1234567890',
    country: 'US',
    preferredLanguage: 'en',
    stellarWalletAddress: 'GTEST123456789',
    role: Role.USER,
    isVerified: true,
    isActive: true,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    lastActiveAt: new Date('2024-01-15'),
  } as User;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById(mockUser.id);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.findById('non-existent-id');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'non-existent-id' },
      });
      expect(result).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('should return user profile when user exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const expectedResponse = plainToInstance(UserResponseDto, mockUser, {
        excludeExtraneousValues: true,
      });

      const result = await service.getProfile(mockUser.id);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(result).toEqual(expectedResponse);
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('updateProfile', () => {
    const updateData: UpdateProfileDto = {
      fullName: 'Updated Name',
      preferredLanguage: 'fr',
    };

    it('should update user profile with provided fields', async () => {
      const updatedUser = { ...mockUser, ...updateData };
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(mockUser.id, updateData);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateData),
      );
      expect(result).toEqual(
        plainToInstance(UserResponseDto, updatedUser, {
          excludeExtraneousValues: true,
        }),
      );
    });

    it('should update only provided fields (partial update)', async () => {
      const partialUpdate: UpdateProfileDto = {
        fullName: 'Partial Update',
      };
      const updatedUser = { ...mockUser, ...partialUpdate };
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(updatedUser);

      await service.updateProfile(mockUser.id, partialUpdate);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Partial Update',
          // Should not include other fields
        }),
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile('non-existent-id', updateData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle empty update data', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);

      const result = await service.updateProfile(mockUser.id, {});

      expect(userRepository.save).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(
        plainToInstance(UserResponseDto, mockUser, {
          excludeExtraneousValues: true,
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('should soft delete user account', async () => {
      const deletedUser = {
        ...mockUser,
        isActive: false,
        email: expect.stringMatching(/^deleted_.*@deleted\.user$/),
        phoneNumber: expect.stringMatching(/^deleted_.*$/),
      };
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(deletedUser);

      await service.softDelete(mockUser.id);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          email: expect.stringMatching(/^deleted_.*@deleted\.user$/),
          phoneNumber: expect.stringMatching(/^deleted_.*$/),
        }),
      );
    });

    it('should anonymize email and phone number', async () => {
      const deletedUser = {
        ...mockUser,
        isActive: false,
        email: `deleted_${mockUser.id}_${Date.now()}@deleted.user`,
        phoneNumber: `deleted_${mockUser.id}_${Date.now()}`,
      };
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(deletedUser);

      await service.softDelete(mockUser.id);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          email: expect.stringMatching(
            `^deleted_${mockUser.id}_.*@deleted\.user$`,
          ),
          phoneNumber: expect.stringMatching(`^deleted_${mockUser.id}_.*$`),
        }),
      );
    });

    it('should handle user without phone number', async () => {
      const userWithoutPhone = { ...mockUser, phoneNumber: null };
      const deletedUser = {
        ...userWithoutPhone,
        isActive: false,
        email: expect.stringMatching(/^deleted_.*@deleted\.user$/),
      };
      userRepository.findOne.mockResolvedValue(userWithoutPhone);
      userRepository.save.mockResolvedValue(deletedUser);

      await service.softDelete(mockUser.id);

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          email: expect.stringMatching(/^deleted_.*@deleted\.user$/),
          phoneNumber: expect.stringMatching(/^deleted_.*$/),
        }),
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.softDelete('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail(mockUser.email);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: mockUser.email },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found by email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'nonexistent@example.com' },
      });
      expect(result).toBeNull();
    });
  });

  describe('findByPhoneNumber', () => {
    it('should return user when found by phone number', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByPhoneNumber(mockUser.phoneNumber);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { phoneNumber: mockUser.phoneNumber },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found by phone number', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.findByPhoneNumber('+9999999999');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { phoneNumber: '+9999999999' },
      });
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const newUserData = {
      email: 'newuser@example.com',
      fullName: 'New User',
      passwordHash: 'hashedPassword',
    };

    it('should create and return new user', async () => {
      const newUser = { ...mockUser, ...newUserData };
      mockUserRepository.create.mockReturnValue(newUser);
      mockUserRepository.save.mockResolvedValue(newUser);

      const result = await service.create(newUserData);

      expect(mockUserRepository.create).toHaveBeenCalledWith(newUserData);
      expect(mockUserRepository.save).toHaveBeenCalledWith(newUser);
      expect(result).toEqual(newUser);
    });
  });

  describe('updateLastActiveAt', () => {
    it('should update last active timestamp', async () => {
      await service.updateLastActiveAt(mockUser.id);

      expect(userRepository.update).toHaveBeenCalledWith(mockUser.id, {
        lastActiveAt: expect.any(Date),
      });
    });
  });

  describe('getStats', () => {
    it('should return default stats when user exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const expectedStats: UserStatsDto = {
        tasksCompleted: 0,
        totalXlmEarned: 0,
        currentStreak: 0,
        longestStreak: 0,
        activeCoupons: 0,
        rank: 0,
      };

      const result = await service.getStats(mockUser.id);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(result).toEqual(expectedStats);
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.getStats('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle database errors gracefully', async () => {
      userRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.findById(mockUser.id)).rejects.toThrow(
        'Database error',
      );
    });

    it('should handle save errors during update', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockRejectedValue(new Error('Save failed'));

      await expect(
        service.updateProfile(mockUser.id, { fullName: 'Test' }),
      ).rejects.toThrow('Save failed');
    });

    it('should handle save errors during soft delete', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockRejectedValue(new Error('Delete failed'));

      await expect(service.softDelete(mockUser.id)).rejects.toThrow(
        'Delete failed',
      );
    });
  });
});
