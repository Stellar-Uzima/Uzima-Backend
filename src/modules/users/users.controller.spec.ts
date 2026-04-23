import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserFilterDto } from './dto/user-filter.dto';
import { PaginatedResponseDto } from '../../common/dtos/pagination.dto';
import { User } from '../../entities/user.entity';
import { Role } from '../../auth/enums/role.enum';
import { ForbiddenException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;
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

  const mockPaginatedResponse: PaginatedResponseDto<User> = {
    data: [mockUser],
    meta: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
      nextPage: undefined,
      prevPage: undefined,
    },
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
      user: mockAdminUser,
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated users for admin', async () => {
      const filterDto: UserFilterDto = {
        page: 1,
        limit: 10,
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      const result = await controller.findAll(filterDto, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(filterDto);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should apply filters correctly', async () => {
      const filterDto: UserFilterDto = {
        page: 1,
        limit: 5,
        role: Role.USER,
        isActive: true,
        search: 'test',
        sort: [{ field: 'createdAt', order: 'DESC' as any }],
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(filterDto, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(filterDto);
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = mockRegularUser;
      const filterDto: UserFilterDto = { page: 1, limit: 10 };

      await expect(controller.findAll(filterDto, mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should work with date range filters', async () => {
      const filterDto: UserFilterDto = {
        page: 1,
        limit: 10,
        createdAtFrom: '2024-01-01T00:00:00.000Z',
        createdAtTo: '2024-12-31T23:59:59.999Z',
        lastActiveFrom: '2024-06-01T00:00:00.000Z',
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(filterDto, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(filterDto);
    });

    it('should work with multiple sort fields', async () => {
      const filterDto: UserFilterDto = {
        page: 1,
        limit: 10,
        sort: [
          { field: 'role', order: 'ASC' as any },
          { field: 'createdAt', order: 'DESC' as any },
        ],
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(filterDto, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(filterDto);
    });

    it('should work with all filter options', async () => {
      const filterDto: UserFilterDto = {
        page: 2,
        limit: 20,
        role: Role.HEALER,
        isActive: false,
        isVerified: true,
        country: 'US',
        preferredLanguage: 'en',
        walletAddress: 'GABC',
        stellarWalletAddress: 'GDEF',
        referralCode: 'REF123',
        minDailyXlmEarned: 10,
        maxDailyXlmEarned: 100,
        phoneNumber: '+123',
        hasPasswordResetToken: false,
        hasEmailVerificationToken: true,
        search: 'john',
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(filterDto, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(filterDto);
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

  describe('Edge Cases', () => {
    it('should handle empty filter DTO', async () => {
      const filterDto = new UserFilterDto();
      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(filterDto, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(filterDto);
    });

    it('should handle pagination edge cases', async () => {
      const filterDto: UserFilterDto = {
        page: 1,
        limit: 1,
      };

      const singleUserResponse: PaginatedResponseDto<User> = {
        data: [mockUser],
        meta: {
          page: 1,
          limit: 1,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          nextPage: undefined,
          prevPage: undefined,
        },
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(singleUserResponse);

      const result = await controller.findAll(filterDto, mockRequest);

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should handle large page numbers', async () => {
      const filterDto: UserFilterDto = {
        page: 100,
        limit: 10,
      };

      const emptyResponse: PaginatedResponseDto<User> = {
        data: [],
        meta: {
          page: 100,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
          nextPage: undefined,
          prevPage: undefined,
        },
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(emptyResponse);

      const result = await controller.findAll(filterDto, mockRequest);

      expect(result.meta.page).toBe(100);
      expect(result.data).toEqual([]);
    });
  });

  describe('Security Tests', () => {
    it('should reject requests without user context', async () => {
      mockRequest.user = null;
      const filterDto: UserFilterDto = { page: 1, limit: 10 };

      await expect(controller.findAll(filterDto, mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should reject requests with invalid user role', async () => {
      mockRequest.user = { ...mockRegularUser, role: 'INVALID_ROLE' };
      const filterDto: UserFilterDto = { page: 1, limit: 10 };

      await expect(controller.findAll(filterDto, mockRequest)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should handle malformed filter DTO gracefully', async () => {
      const malformedFilter = {
        page: 'invalid',
        limit: 'invalid',
        role: 'INVALID_ROLE',
        isActive: 'invalid',
      } as any;

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      // The controller should pass the DTO to the service, which will handle validation
      await controller.findAll(malformedFilter, mockRequest);

      expect(service.listUsers).toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large result sets', async () => {
      const largeResponse: PaginatedResponseDto<User> = {
        data: Array(100).fill(mockUser),
        meta: {
          page: 1,
          limit: 100,
          total: 1000,
          totalPages: 10,
          hasNext: true,
          hasPrev: false,
          nextPage: 2,
          prevPage: undefined,
        },
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(largeResponse);

      const filterDto: UserFilterDto = { page: 1, limit: 100 };
      const result = await controller.findAll(filterDto, mockRequest);

      expect(result.data).toHaveLength(100);
      expect(result.meta.total).toBe(1000);
      expect(result.meta.totalPages).toBe(10);
    });

    it('should handle complex filter combinations', async () => {
      const complexFilter: UserFilterDto = {
        page: 1,
        limit: 50,
        role: Role.USER,
        isActive: true,
        isVerified: true,
        createdAtFrom: '2024-01-01T00:00:00.000Z',
        createdAtTo: '2024-12-31T23:59:59.999Z',
        country: 'US',
        preferredLanguage: 'en',
        minDailyXlmEarned: 0,
        maxDailyXlmEarned: 1000,
        search: 'john',
        sort: [
          { field: 'createdAt', order: 'DESC' as any },
          { field: 'firstName', order: 'ASC' as any },
        ],
      };

      jest.spyOn(service, 'listUsers').mockResolvedValue(mockPaginatedResponse);

      await controller.findAll(complexFilter, mockRequest);

      expect(service.listUsers).toHaveBeenCalledWith(complexFilter);
    });
  });
});
