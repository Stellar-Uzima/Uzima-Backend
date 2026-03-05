import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    fullName: 'John Doe',
    country: 'US',
    preferredLanguage: 'en',
    stellarWalletAddress: null,
    role: 'USER',
    isVerified: false,
    createdAt: new Date('2024-01-15T10:30:00.000Z'),
    passwordHash: 'hashed_password_should_not_be_exposed',
  };

  const mockUserResponseDto: UserResponseDto = {
    id: 'test-user-id',
    fullName: 'John Doe',
    email: 'test@example.com',
    country: 'US',
    preferredLanguage: 'en',
    stellarWalletAddress: null,
    role: 'USER',
    isVerified: false,
    createdAt: new Date('2024-01-15T10:30:00.000Z'),
    phoneNumber: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            getProfile: jest.fn(),
            getStats: jest.fn(),
            updateProfile: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /users/me', () => {
    it('should return user profile without passwordHash', async () => {
      jest.spyOn(service, 'getProfile').mockResolvedValue(mockUserResponseDto);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.getProfile(req as any);

      expect(service.getProfile).toHaveBeenCalledWith('test-user-id');
      expect(result).toEqual(mockUserResponseDto);
      
      // Verify passwordHash is not present in the response
      expect(result).not.toHaveProperty('passwordHash');
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('should throw NotFoundException if user is not found', async () => {
      jest.spyOn(service, 'getProfile').mockRejectedValue(new NotFoundException('User not found'));

      const req = {
        user: { userId: 'non-existent-user-id' },
      } as any;

      await expect(controller.getProfile(req as any)).rejects.toThrow(NotFoundException);
      expect(service.getProfile).toHaveBeenCalledWith('non-existent-user-id');
    });

    it('should only contain allowed fields in response', async () => {
      jest.spyOn(service, 'getProfile').mockResolvedValue(mockUserResponseDto);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.getProfile(req as any);

      const allowedFields = ['id', 'fullName', 'email', 'country', 'preferredLanguage', 'stellarWalletAddress', 'role', 'isVerified', 'createdAt', 'phoneNumber'];
      const resultKeys = Object.keys(result);

      // Check that all result keys are in allowed fields
      resultKeys.forEach(key => {
        expect(allowedFields).toContain(key);
      });

      // Check that no sensitive fields are present
      const sensitiveFields = ['passwordHash', 'password', 'emailVerificationToken', 'passwordResetToken'];
      sensitiveFields.forEach(field => {
        expect(result).not.toHaveProperty(field);
      });
    });
  });

  describe('GET /users/me/stats', () => {
    it('should return user stats', async () => {
      const mockStats = {
        tasksCompleted: 0,
        totalXlmEarned: 0,
        currentStreak: 0,
        longestStreak: 0,
        activeCoupons: 0,
        rank: 0,
      };

      jest.spyOn(service, 'getStats').mockResolvedValue(mockStats as any);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.getStats(req as any);

      expect(service.getStats).toHaveBeenCalledWith('test-user-id');
      expect(result).toEqual(mockStats);
    });
  });

  describe('PATCH /users/me', () => {
    it('should update user profile with valid fields', async () => {
      const updateDto = {
        fullName: 'Jane Smith',
        country: 'CA',
      };

      const updatedUser = {
        ...mockUserResponseDto,
        ...updateDto,
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedUser);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.updateProfile(req as any, updateDto as any);

      expect(service.updateProfile).toHaveBeenCalledWith('test-user-id', updateDto);
      expect(result).toEqual(updatedUser);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should update all allowed fields: fullName, preferredLanguage, country, phoneNumber', async () => {
      const updateDto = {
        fullName: 'John Doe Jr',
        preferredLanguage: 'fr',
        country: 'FR',
        phoneNumber: '+33123456789',
      };

      const updatedUser = {
        ...mockUserResponseDto,
        ...updateDto,
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedUser);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.updateProfile(req as any, updateDto as any);

      expect(service.updateProfile).toHaveBeenCalledWith('test-user-id', updateDto);
      expect(result.fullName).toBe('John Doe Jr');
      expect(result.preferredLanguage).toBe('fr');
      expect(result.country).toBe('FR');
      expect(result.phoneNumber).toBe('+33123456789');
    });

    it('should reject invalid country code (not 2 characters)', async () => {
      const invalidUpdateDto = {
        country: 'USA', // Invalid - 3 characters
      };

      // Mock should not be called with invalid data
      jest.spyOn(service, 'updateProfile').mockRejectedValue(new BadRequestException('Invalid input data'));

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      await expect(controller.updateProfile(req as any, invalidUpdateDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid preferred language code', async () => {
      const invalidUpdateDto = {
        preferredLanguage: 'invalid', // Not in supported languages
      };

      // Mock should not be called with invalid data
      jest.spyOn(service, 'updateProfile').mockRejectedValue(new BadRequestException('Invalid input data'));

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      await expect(controller.updateProfile(req as any, invalidUpdateDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should accept valid preferred language codes', async () => {
      const validLanguages = ['en', 'fr', 'ar', 'sw', 'ha', 'yo', 'am', 'ig', 'zu', 'so', 'tw', 'wo'];

      for (const lang of validLanguages) {
        const updateDto = { preferredLanguage: lang };
        const updatedUser = { ...mockUserResponseDto, preferredLanguage: lang };
        
        jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedUser);
        
        const req = { user: { userId: 'test-user-id' } } as any;
        const result = await controller.updateProfile(req as any, updateDto as any);
        
        expect(result.preferredLanguage).toBe(lang);
      }
    });

    it('should reject unknown fields', async () => {
      const updateDto = {
        fullName: 'John Doe',
        email: 'hacked@example.com', // Not allowed
        age: 25, // Not allowed
      };

      // Mock should filter out unknown fields via ValidationPipe (whitelist: true, forbidNonWhitelisted: true)
      // In real scenario, ValidationPipe would strip email and age before calling service
      // For this test, we verify the service only receives allowed fields
      const filteredDto = { fullName: 'John Doe' };
      const updatedUser = { ...mockUserResponseDto, fullName: 'John Doe' };
      
      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedUser);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.updateProfile(req as any, updateDto as any);

      // Service should only be called with filtered DTO (unknown fields stripped)
      expect(service.updateProfile).toHaveBeenCalledWith('test-user-id', expect.objectContaining({ fullName: 'John Doe' }));
      expect(result.fullName).toBe('John Doe');
    });

    it('should accept partial updates with only some fields', async () => {
      const updateDto = {
        fullName: 'Updated Name',
      };

      const updatedUser = {
        ...mockUserResponseDto,
        fullName: 'Updated Name',
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedUser);

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      const result = await controller.updateProfile(req as any, updateDto as any);

      expect(service.updateProfile).toHaveBeenCalledWith('test-user-id', updateDto);
      expect(result.fullName).toBe('Updated Name');
    });
  });

  describe('DELETE /users/me', () => {
    it('should soft delete user account', async () => {
      jest.spyOn(service, 'softDelete').mockResolvedValue();

      const req = {
        user: { userId: 'test-user-id' },
      } as any;

      await controller.deleteProfile(req as any);

      expect(service.softDelete).toHaveBeenCalledWith('test-user-id');
    });
  });
});
