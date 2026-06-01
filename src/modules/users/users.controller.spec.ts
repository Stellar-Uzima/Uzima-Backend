import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserSearchService } from './services/user-search.service';
import { ActivityFeedService } from './services/activity-feed.service';
import { UserSearchDto, UserSearchResponseDto } from './dto/user-search.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { User } from '../../entities/user.entity';
import { Role } from '../../auth/enums/role.enum';
import { ForbiddenException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;
  let userSearchService: UserSearchService;
  let mockRequest: any;

  const mockUser: User = {
    id: 'test-id',
    email: 'test@example.com',
    phoneNumber: '+1234567890',
    country: 'US',
    preferredLanguage: 'en',
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    role: Role.USER,
    isActive: true,
    isVerified: true,
    walletAddress: null,
    stellarWalletAddress: null,
    dailyXlmEarned: 0,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    referralCode: 'TEST123',
    password: 'hashedPassword',
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
  };

  const mockSearchResponse: UserSearchResponseDto = {
    results: [mockUser],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
    query: undefined,
    executionTimeMs: 5,
    fuzzyUsed: false,
  };

  const mockAdminUser = {
    id: 'admin-id',
    email: 'admin@example.com',
    role: Role.ADMIN,
  };

  const mockRegularUser = {
    id: 'user-id',
    email: 'user@example.com',
    role: Role.USER,
  };

  beforeEach(async () => {
    const mockUsersService = {
      listUsers: jest.fn(),
      findOne: jest.fn(),
      getUserStats: jest.fn(),
      registerDeviceToken: jest.fn(),
    };

    const mockUserSearchService = {
      searchUsers: jest.fn(),
    };

    const mockActivityFeedService = {
      getActivityFeed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: UserSearchService,
          useValue: mockUserSearchService,
        },
        {
          provide: ActivityFeedService,
          useValue: mockActivityFeedService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
    userSearchService = module.get<UserSearchService>(UserSearchService);

    mockRequest = {
      user: mockAdminUser,
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated search results', async () => {
      const searchDto: UserSearchDto = {
        page: 1,
        limit: 10,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      const result = await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
      expect(result).toEqual({
        data: mockSearchResponse.results,
        total: mockSearchResponse.total,
        page: mockSearchResponse.page,
        limit: mockSearchResponse.limit,
        totalPages: mockSearchResponse.totalPages,
        query: mockSearchResponse.query,
        executionTimeMs: mockSearchResponse.executionTimeMs,
        fuzzyUsed: mockSearchResponse.fuzzyUsed,
      });
    });

    it('should apply filters correctly', async () => {
      const searchDto: UserSearchDto & Partial<UserFilterDto> = {
        page: 1,
        limit: 5,
        role: Role.USER,
        isVerified: true,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      await controller.findAll(searchDto as UserSearchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
    });

    it('should return paginated results even for non-admin users', async () => {
      mockRequest.user = mockRegularUser;
      const searchDto: UserSearchDto = { page: 1, limit: 10 };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      const result = await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
      expect(result.data).toEqual(mockSearchResponse.results);
    });

    it('should work with createdAt range filters', async () => {
      const searchDto: UserSearchDto = {
        page: 1,
        limit: 10,
        createdAtFrom: '2024-01-01T00:00:00.000Z',
        createdAtTo: '2024-12-31T23:59:59.999Z',
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
    });

    it('should work with multiple sort fields', async () => {
      const searchDto: UserSearchDto = {
        page: 1,
        limit: 10,
        sortBy: 'role',
        sortOrder: 'ASC' as any,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
    });

    it('should work with available search filter options', async () => {
      const searchDto: UserSearchDto = {
        page: 2,
        limit: 20,
        role: Role.HEALER,
        isVerified: true,
        country: 'US',
        preferredLanguage: 'en',
        sortBy: 'createdAt',
        sortOrder: 'DESC' as any,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
    });
  });

  describe('findOne', () => {
    it('should return user for admin', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockUser);

      const result = await controller.findOne('test-id', mockRequest);

      expect(service.findOne).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockUser);
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = mockRegularUser;

      await expect(controller.findOne('test-id', mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw ForbiddenException when user not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(null);

      await expect(controller.findOne('nonexistent-id', mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('update', () => {
    it('should return update message for admin', async () => {
      const updateData = { firstName: 'Updated' };

      const result = await controller.update('test-id', updateData, mockRequest);

      expect(result).toEqual({
        message: 'Update user logic to be implemented',
        userId: 'test-id',
      });
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = mockRegularUser;

      await expect(
        controller.update('test-id', {}, mockRequest)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should return delete message for admin', async () => {
      const result = await controller.delete('test-id', mockRequest);

      expect(result).toEqual({
        message: 'Delete user logic to be implemented',
        userId: 'test-id',
      });
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = mockRegularUser;

      await expect(controller.delete('test-id', mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('getProfile', () => {
    it('should return user stats for admin', async () => {
      const mockStats = {
        userId: 'test-id',
        totalTasksCompleted: 10,
        totalEarnings: 100,
        currentStreak: 5,
        referralCount: 3,
        dailyXlmEarned: 5.5,
      };

      jest.spyOn(service, 'getUserStats').mockResolvedValue(mockStats);

      const result = await controller.getProfile('test-id', mockRequest);

      expect(service.getUserStats).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockStats);
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = mockRegularUser;

      await expect(controller.getProfile('test-id', mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('registerDeviceToken', () => {
    it('should register a device token successfully', async () => {
      const dto = { token: 'fcm-token-123' };
      mockRequest.user = mockRegularUser;

      jest.spyOn(service, 'registerDeviceToken').mockResolvedValue(mockUser);

      const result = await controller.registerDeviceToken(dto, mockRequest);

      expect(service.registerDeviceToken).toHaveBeenCalledWith('user-id', 'fcm-token-123');
      expect(result).toEqual({ success: true, message: 'Device token registered successfully' });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search DTO', async () => {
      const searchDto = new UserSearchDto();
      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
    });

    it('should handle pagination edge cases', async () => {
      const searchDto: UserSearchDto = {
        page: 1,
        limit: 1,
      };

      const singleUserResponse: UserSearchResponseDto = {
        ...mockSearchResponse,
        page: 1,
        limit: 1,
        totalPages: 1,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(singleUserResponse);

      const result = await controller.findAll(searchDto, mockRequest);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should handle large page numbers', async () => {
      const searchDto: UserSearchDto = {
        page: 100,
        limit: 10,
      };

      const emptyResponse: UserSearchResponseDto = {
        ...mockSearchResponse,
        results: [],
        page: 100,
        limit: 10,
        total: 0,
        totalPages: 0,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(emptyResponse);

      const result = await controller.findAll(searchDto, mockRequest);

      expect(result.page).toBe(100);
      expect(result.data).toEqual([]);
    });
  });

  describe('Security Tests', () => {
    it('should allow search without explicit user context in unit tests', async () => {
      mockRequest.user = null;
      const searchDto: UserSearchDto = { page: 1, limit: 10 };
      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      const result = await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
      expect(result.data).toEqual(mockSearchResponse.results);
    });

    it('should accept invalid user role values at the controller layer when provided directly', async () => {
      mockRequest.user = { ...mockRegularUser, role: 'INVALID_ROLE' };
      const searchDto: UserSearchDto = { page: 1, limit: 10 };
      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      const result = await controller.findAll(searchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(searchDto);
      expect(result.data).toEqual(mockSearchResponse.results);
    });

    it('should handle malformed search DTO gracefully in unit tests', async () => {
      const malformedFilter = {
        page: 'invalid',
        limit: 'invalid',
        role: 'INVALID_ROLE',
        isActive: 'invalid',
      } as any;

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      // The controller should call searchUsers with the provided object
      await controller.findAll(malformedFilter, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large result sets', async () => {
      const largeResponse: UserSearchResponseDto = {
        ...mockSearchResponse,
        results: Array(100).fill(mockUser),
        page: 1,
        limit: 100,
        total: 1000,
        totalPages: 10,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(largeResponse);

      const filterDto: UserSearchDto = { page: 1, limit: 100 };
      const result = await controller.findAll(filterDto, mockRequest);

      expect(result.data).toHaveLength(100);
      expect(result.total).toBe(1000);
      expect(result.totalPages).toBe(10);
    });

    it('should handle complex filter combinations', async () => {
      const complexFilter: UserSearchDto & Partial<UserFilterDto> = {
        page: 1,
        limit: 50,
        role: Role.USER,
        isVerified: true,
        createdAtFrom: '2024-01-01T00:00:00.000Z',
        createdAtTo: '2024-12-31T23:59:59.999Z',
        country: 'US',
        preferredLanguage: 'en',
        sortBy: 'createdAt',
        sortOrder: 'DESC' as any,
      };

      jest.spyOn(userSearchService, 'searchUsers').mockResolvedValue(mockSearchResponse);

      await controller.findAll(complexFilter as UserSearchDto, mockRequest);

      expect(userSearchService.searchUsers).toHaveBeenCalledWith(complexFilter);
    });
  });
});
