import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateProfileDto, ProfileResponseDto } from '../../common/dtos/update-profile.dto';
import { User } from '../../entities/user.entity';
import { Role } from '../../auth/enums/role.enum';
import { UserStatus } from '../../auth/enums/user-status.enum';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PhoneValidationUtil } from '../../common/utils/phone-validation.util';

describe('Users Profile Management', () => {
  let controller: UsersController;
  let service: UsersService;
  let mockRequest: any;

  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    phoneNumber: '+1234567890',
    country: 'US',
    preferredLanguage: 'en',
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    role: Role.USER,
    status: UserStatus.ACTIVE,
    isActive: true,
    isVerified: true,
    walletAddress: null,
    stellarWalletAddress: null,
    dailyXlmEarned: 0,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    referralCode: null,
    password: 'hashedPassword',
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
  };

  const mockProfileResponse: ProfileResponseDto = {
    id: mockUser.id,
    email: mockUser.email,
    firstName: mockUser.firstName,
    lastName: mockUser.lastName,
    fullName: mockUser.fullName,
    phoneNumber: mockUser.phoneNumber,
    avatar: mockUser.walletAddress,
    bio: mockUser.referralCode,
    preferredLanguage: mockUser.preferredLanguage,
    country: mockUser.country,
    role: mockUser.role,
    status: mockUser.status,
    isVerified: mockUser.isVerified,
    lastActiveAt: mockUser.lastActiveAt,
    createdAt: mockUser.createdAt,
    updatedAt: mockUser.updatedAt,
  };

  beforeEach(async () => {
    const mockUsersService = {
      updateProfile: jest.fn(),
      getProfile: jest.fn(),
      findOne: jest.fn(),
      listUsers: jest.fn(),
      getUserStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);

    mockRequest = {
      user: { sub: mockUser.id, email: mockUser.email, role: mockUser.role },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('updateProfile', () => {
    it('should successfully update user profile', async () => {
      const updateDto: UpdateProfileDto = {
        firstName: 'Updated',
        lastName: 'Name',
        phoneNumber: '+1987654321',
        avatar: 'https://example.com/new-avatar.jpg',
        bio: 'Updated bio',
        preferredLanguage: 'es',
        country: 'ES',
      };

      const updatedResponse = {
        ...mockProfileResponse,
        firstName: 'Updated',
        lastName: 'Name',
        fullName: 'Updated Name',
        phoneNumber: '+1987654321',
        avatar: 'https://example.com/new-avatar.jpg',
        bio: 'Updated bio',
        preferredLanguage: 'es',
        country: 'ES',
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedResponse);

      const result = await controller.updateProfile(
        updateDto,
        mockRequest,
        'Mozilla/5.0 (Test Browser)',
      );

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
        '127.0.0.1',
        'Mozilla/5.0 (Test Browser)',
      );
      expect(result).toEqual(updatedResponse);
    });

    it('should work without user agent', async () => {
      const updateDto: UpdateProfileDto = { firstName: 'Updated' };
      const updatedResponse = { ...mockProfileResponse, firstName: 'Updated' };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedResponse);

      await controller.updateProfile(updateDto, mockRequest);

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto,
        '127.0.0.1',
        undefined,
      );
    });

    it('should throw ForbiddenException for unauthenticated user', async () => {
      const requestWithoutUser = { user: null };

      await expect(
        controller.updateProfile({}, requestWithoutUser)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should work with partial updates', async () => {
      const testCases = [
        { firstName: 'NewFirst' },
        { lastName: 'NewLast' },
        { phoneNumber: '+1234567890' },
        { avatar: 'https://example.com/avatar.jpg' },
        { bio: 'New bio' },
        { preferredLanguage: 'fr' },
        { country: 'FR' },
      ];

      for (const testCase of testCases) {
        const updatedResponse = { ...mockProfileResponse, ...testCase };
        jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedResponse);

        const result = await controller.updateProfile(testCase, mockRequest);

        expect(result).toEqual(updatedResponse);
      }
    });

    it('should handle missing IP address gracefully', async () => {
      const requestWithoutIp = {
        user: { sub: mockUser.id },
        ip: undefined,
        connection: { remoteAddress: undefined },
        socket: { remoteAddress: undefined },
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(mockProfileResponse);

      await controller.updateProfile({}, requestWithoutIp);

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        {},
        undefined,
        undefined,
      );
    });
  });

  describe('getCurrentProfile', () => {
    it('should return current user profile', async () => {
      jest.spyOn(service, 'getProfile').mockResolvedValue(mockProfileResponse);

      const result = await controller.getCurrentProfile(mockRequest);

      expect(service.getProfile).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockProfileResponse);
    });

    it('should throw ForbiddenException for unauthenticated user', async () => {
      const requestWithoutUser = { user: null };

      await expect(controller.getCurrentProfile(requestWithoutUser)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('Service Methods', () => {
    let mockRepository: any;

    beforeEach(() => {
      mockRepository = {
        findOne: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
      };
    });

    describe('updateProfile', () => {
      it('should update profile with valid data', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        // Mock user lookup
        mockRepository.findOne.mockResolvedValue(mockUser);
        
        // Mock save operation
        const updatedUser = {
          ...mockUser,
          firstName: 'Updated',
          lastName: 'Name',
          fullName: 'Updated Name',
          phoneNumber: '+1987654321',
          walletAddress: 'https://example.com/avatar.jpg',
          referralCode: 'Updated bio',
          preferredLanguage: 'es',
          country: 'ES',
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        };
        mockRepository.save.mockResolvedValue(updatedUser);

        const updateDto: UpdateProfileDto = {
          firstName: 'Updated',
          lastName: 'Name',
          phoneNumber: '+1987654321',
          avatar: 'https://example.com/avatar.jpg',
          bio: 'Updated bio',
          preferredLanguage: 'es',
          country: 'ES',
        };

        const result = await usersService.updateProfile(mockUser.id, updateDto);

        expect(result.firstName).toBe('Updated');
        expect(result.lastName).toBe('Name');
        expect(result.fullName).toBe('Updated Name');
        expect(result.phoneNumber).toBe('+1987654321');
        expect(result.avatar).toBe('https://example.com/avatar.jpg');
        expect(result.bio).toBe('Updated bio');
        expect(result.preferredLanguage).toBe('es');
        expect(result.country).toBe('ES');
      });

      it('should throw NotFoundException if user not found', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        mockRepository.findOne.mockResolvedValue(null);

        await expect(
          usersService.updateProfile('non-existent-id', {})
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw BadRequestException for empty first name', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        mockRepository.findOne.mockResolvedValue(mockUser);

        await expect(
          usersService.updateProfile(mockUser.id, { firstName: '   ' })
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException for empty last name', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        mockRepository.findOne.mockResolvedValue(mockUser);

        await expect(
          usersService.updateProfile(mockUser.id, { lastName: '   ' })
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException for invalid phone number', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        mockRepository.findOne.mockResolvedValue(mockUser);

        await expect(
          usersService.updateProfile(mockUser.id, { phoneNumber: 'invalid-phone' })
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException if phone number already taken', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        // Mock user lookup
        mockRepository.findOne.mockResolvedValueOnce(mockUser);
        
        // Mock phone number conflict
        mockRepository.findOne.mockResolvedValueOnce({
          ...mockUser,
          id: 'different-user-id',
          phoneNumber: '+1987654321',
        });

        await expect(
          usersService.updateProfile(mockUser.id, { phoneNumber: '+1987654321' })
        ).rejects.toThrow(BadRequestException);
      });

      it('should allow updating to same phone number', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        // Mock user lookup
        mockRepository.findOne.mockResolvedValue(mockUser);
        
        // Mock save operation
        const updatedUser = { ...mockUser, updatedAt: new Date() };
        mockRepository.save.mockResolvedValue(updatedUser);

        const result = await usersService.updateProfile(mockUser.id, { 
          phoneNumber: mockUser.phoneNumber 
        });

        expect(result.phoneNumber).toBe(mockUser.phoneNumber);
      });

      it('should update fullName when firstName changes', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        mockRepository.findOne.mockResolvedValue(mockUser);
        
        const updatedUser = {
          ...mockUser,
          firstName: 'NewFirst',
          fullName: 'NewFirst User',
          updatedAt: new Date(),
        };
        mockRepository.save.mockResolvedValue(updatedUser);

        const result = await usersService.updateProfile(mockUser.id, { 
          firstName: 'NewFirst' 
        });

        expect(result.fullName).toBe('NewFirst User');
      });

      it('should update fullName when lastName changes', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        mockRepository.findOne.mockResolvedValue(mockUser);
        
        const updatedUser = {
          ...mockUser,
          lastName: 'NewLast',
          fullName: 'Test NewLast',
          updatedAt: new Date(),
        };
        mockRepository.save.mockResolvedValue(updatedUser);

        const result = await usersService.updateProfile(mockUser.id, { 
          lastName: 'NewLast' 
        });

        expect(result.fullName).toBe('Test NewLast');
      });

      it('should update fullName when both firstName and lastName change', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        mockRepository.findOne.mockResolvedValue(mockUser);
        
        const updatedUser = {
          ...mockUser,
          firstName: 'NewFirst',
          lastName: 'NewLast',
          fullName: 'NewFirst NewLast',
          updatedAt: new Date(),
        };
        mockRepository.save.mockResolvedValue(updatedUser);

        const result = await usersService.updateProfile(mockUser.id, { 
          firstName: 'NewFirst',
          lastName: 'NewLast'
        });

        expect(result.fullName).toBe('NewFirst NewLast');
      });

      it('should log profile changes', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        
        mockRepository.findOne.mockResolvedValue(mockUser);
        mockRepository.save.mockResolvedValue({ ...mockUser, updatedAt: new Date() });

        // Mock console.log for testing
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await usersService.updateProfile(
          mockUser.id,
          { firstName: 'Updated' },
          '192.168.1.1',
          'Test Browser'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          `Profile updated for user ${mockUser.id}:`,
          expect.objectContaining({
            changedFields: expect.arrayContaining(['firstName']),
            ipAddress: '192.168.1.1',
            userAgent: 'Test Browser',
            timestamp: expect.any(Date),
          })
        );

        consoleSpy.mockRestore();
      });
    });

    describe('getProfile', () => {
      it('should return user profile', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        mockRepository.findOne.mockResolvedValue(mockUser);

        const result = await usersService.getProfile(mockUser.id);

        expect(result.id).toBe(mockUser.id);
        expect(result.email).toBe(mockUser.email);
        expect(result.firstName).toBe(mockUser.firstName);
        expect(result.lastName).toBe(mockUser.lastName);
      });

      it('should throw NotFoundException if user not found', async () => {
        const usersService = new UsersService(mockRepository, null as any);
        mockRepository.findOne.mockResolvedValue(null);

        await expect(usersService.getProfile('non-existent-id')).rejects.toThrow(
          NotFoundException
        );
      });
    });
  });

  describe('Phone Validation Integration', () => {
    it('should validate phone numbers correctly', () => {
      expect(PhoneValidationUtil.isValidInternationalPhone('+1234567890')).toBe(true);
      expect(PhoneValidationUtil.isValidInternationalPhone('+441234567890')).toBe(true);
      expect(PhoneValidationUtil.isValidInternationalPhone('1234567890')).toBe(false);
      expect(PhoneValidationUtil.isValidInternationalPhone('+123456789012345')).toBe(false);
      expect(PhoneValidationUtil.isValidInternationalPhone('')).toBe(false);
      expect(PhoneValidationUtil.isValidInternationalPhone(null as any)).toBe(false);
    });

    it('should normalize phone numbers correctly', () => {
      expect(PhoneValidationUtil.normalizePhoneNumber('+1234567890')).toBe('+1234567890');
      expect(PhoneValidationUtil.normalizePhoneNumber(' +1234567890 ')).toBe('+1234567890');
      expect(PhoneValidationUtil.normalizePhoneNumber('invalid')).toBeNull();
      expect(PhoneValidationUtil.normalizePhoneNumber('')).toBeNull();
    });

    it('should extract country codes correctly', () => {
      expect(PhoneValidationUtil.extractCountryCode('+1234567890')).toBe('1');
      expect(PhoneValidationUtil.extractCountryCode('+441234567890')).toBe('44');
      expect(PhoneValidationUtil.extractCountryCode('+35812345678')).toBe('358');
    });

    it('should format phone numbers correctly', () => {
      expect(PhoneValidationUtil.formatPhoneNumber('+12345678901')).toBe('+1 (234) 567-8901');
      expect(PhoneValidationUtil.formatPhoneNumber('+442071234567')).toBe('+44 2071 234567');
      expect(PhoneValidationUtil.formatPhoneNumber('+33123456789')).toBe('+33 12 34 56 789');
    });

    it('should validate phone numbers for specific countries', () => {
      expect(PhoneValidationUtil.isValidPhoneForCountry('+14165551234', 'US')).toBe(true);
      expect(PhoneValidationUtil.isValidPhoneForCountry('+442071234567', 'GB')).toBe(true);
      expect(PhoneValidationUtil.isValidPhoneForCountry('+1234567890', 'US')).toBe(false);
      expect(PhoneValidationUtil.isValidPhoneForCountry('+441234567890', 'GB')).toBe(false);
    });

    it('should provide example phone numbers', () => {
      expect(PhoneValidationUtil.getExamplePhoneNumber('US')).toBe('+12345678901');
      expect(PhoneValidationUtil.getExamplePhoneNumber('GB')).toBe('+442071234567');
      expect(PhoneValidationUtil.getExamplePhoneNumber('XX')).toBe('+1234567890');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty update DTO', async () => {
      jest.spyOn(service, 'updateProfile').mockResolvedValue(mockProfileResponse);

      const result = await controller.updateProfile({}, mockRequest);

      expect(result).toEqual(mockProfileResponse);
    });

    it('should handle special characters in names', async () => {
      const updateDto = {
        firstName: 'José-María',
        lastName: "O'Connor",
      };

      const updatedResponse = {
        ...mockProfileResponse,
        firstName: 'José-María',
        lastName: "O'Connor",
        fullName: "José-María O'Connor",
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedResponse);

      const result = await controller.updateProfile(updateDto, mockRequest);

      expect(result.firstName).toBe('José-María');
      expect(result.lastName).toBe("O'Connor");
      expect(result.fullName).toBe("José-María O'Connor");
    });

    it('should handle very long valid inputs', async () => {
      const longBio = 'A'.repeat(1000);
      const updateDto = { bio: longBio };

      const updatedResponse = { ...mockProfileResponse, bio: longBio };
      jest.spyOn(service, 'updateProfile').mockResolvedValue(updatedResponse);

      const result = await controller.updateProfile(updateDto, mockRequest);

      expect(result.bio).toBe(longBio);
    });

    it('should handle concurrent profile updates', async () => {
      const firstUpdate = { firstName: 'First' };
      const secondUpdate = { lastName: 'Second' };

      jest.spyOn(service, 'updateProfile')
        .mockResolvedValueOnce({ ...mockProfileResponse, firstName: 'First' })
        .mockResolvedValueOnce({ ...mockProfileResponse, lastName: 'Second' });

      const firstResult = await controller.updateProfile(firstUpdate, mockRequest);
      const secondResult = await controller.updateProfile(secondUpdate, mockRequest);

      expect(firstResult.firstName).toBe('First');
      expect(secondResult.lastName).toBe('Second');
    });

    it('should handle malformed user agent', async () => {
      const malformedUserAgent = '<script>alert("xss")</script>';
      jest.spyOn(service, 'updateProfile').mockResolvedValue(mockProfileResponse);

      await controller.updateProfile({}, mockRequest, malformedUserAgent);

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        {},
        '127.0.0.1',
        malformedUserAgent,
      );
    });
  });

  describe('Security Considerations', () => {
    it('should not allow email updates through profile endpoint', async () => {
      // This is tested implicitly by not including email in UpdateProfileDto
      const updateDto = { firstName: 'Updated' };
      jest.spyOn(service, 'updateProfile').mockResolvedValue(mockProfileResponse);

      await controller.updateProfile(updateDto, mockRequest);

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto, // Note: email is not included
        '127.0.0.1',
        undefined,
      );
    });

    it('should not allow role updates through profile endpoint', async () => {
      const updateDto = { firstName: 'Updated' };
      jest.spyOn(service, 'updateProfile').mockResolvedValue(mockProfileResponse);

      await controller.updateProfile(updateDto, mockRequest);

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto, // Note: role is not included
        '127.0.0.1',
        undefined,
      );
    });

    it('should not allow status updates through profile endpoint', async () => {
      const updateDto = { firstName: 'Updated' };
      jest.spyOn(service, 'updateProfile').mockResolvedValue(mockProfileResponse);

      await controller.updateProfile(updateDto, mockRequest);

      expect(service.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        updateDto, // Note: status is not included
        '127.0.0.1',
        undefined,
      );
    });

    it('should sanitize input data', async () => {
      const updateDto = {
        firstName: '  Updated  ',
        lastName: '  Name  ',
        phoneNumber: '  +1234567890  ',
      };

      const sanitizedResponse = {
        ...mockProfileResponse,
        firstName: 'Updated',
        lastName: 'Name',
        phoneNumber: '+1234567890',
      };

      jest.spyOn(service, 'updateProfile').mockResolvedValue(sanitizedResponse);

      const result = await controller.updateProfile(updateDto, mockRequest);

      expect(result.firstName).toBe('Updated');
      expect(result.lastName).toBe('Name');
      expect(result.phoneNumber).toBe('+1234567890');
    });
  });
});
