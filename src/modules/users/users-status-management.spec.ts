import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserStatusChangeDto, UserStatusResponseDto } from './dto/user-status-change.dto';
import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UserStatus } from '../../auth/enums/user-status.enum';
import { Role } from '../../auth/enums/role.enum';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Users Status Management', () => {
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
    referralCode: 'TEST123',
    password: 'hashedPassword',
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
  };

  const mockAdminUser: User = {
    ...mockUser,
    id: 'admin-user-id',
    email: 'admin@example.com',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
  };

  const mockStatusChangeDto: UserStatusChangeDto = {
    status: UserStatus.INACTIVE,
    reason: 'User requested account deactivation',
    notes: 'User will be reactivated after verification process',
  };

  const mockStatusResponse: UserStatusResponseDto = {
    userId: mockUser.id,
    previousStatus: UserStatus.ACTIVE,
    newStatus: UserStatus.INACTIVE,
    changedAt: new Date(),
    changedBy: mockAdminUser.id,
    changedByRole: Role.ADMIN,
    reason: 'User requested account deactivation',
    notes: 'User will be reactivated after verification process',
  };

  beforeEach(async () => {
    const mockUsersService = {
      changeUserStatus: jest.fn(),
      getUserStatusHistory: jest.fn(),
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
      user: mockAdminUser,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('changeUserStatus', () => {
    it('should successfully change user status', async () => {
      jest.spyOn(service, 'changeUserStatus').mockResolvedValue(mockStatusResponse);

      const result = await controller.changeUserStatus(
        mockUser.id,
        mockStatusChangeDto,
        mockRequest,
        'Mozilla/5.0 (Test Browser)',
      );

      expect(service.changeUserStatus).toHaveBeenCalledWith(
        mockUser.id,
        mockStatusChangeDto,
        mockAdminUser.id,
        '127.0.0.1',
        'Mozilla/5.0 (Test Browser)',
      );
      expect(result).toEqual(mockStatusResponse);
    });

    it('should work without user agent', async () => {
      jest.spyOn(service, 'changeUserStatus').mockResolvedValue(mockStatusResponse);

      await controller.changeUserStatus(
        mockUser.id,
        mockStatusChangeDto,
        mockRequest,
      );

      expect(service.changeUserStatus).toHaveBeenCalledWith(
        mockUser.id,
        mockStatusChangeDto,
        mockAdminUser.id,
        '127.0.0.1',
        undefined,
      );
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = { ...mockUser, role: Role.USER };

      await expect(
        controller.changeUserStatus(mockUser.id, mockStatusChangeDto, mockRequest)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle different status changes', async () => {
      const testCases = [
        { from: UserStatus.ACTIVE, to: UserStatus.INACTIVE },
        { from: UserStatus.INACTIVE, to: UserStatus.ACTIVE },
        { from: UserStatus.ACTIVE, to: UserStatus.SUSPENDED },
        { from: UserStatus.SUSPENDED, to: UserStatus.ACTIVE },
      ];

      for (const testCase of testCases) {
        const response = {
          ...mockStatusResponse,
          previousStatus: testCase.from,
          newStatus: testCase.to,
        };

        jest.spyOn(service, 'changeUserStatus').mockResolvedValue(response);

        const result = await controller.changeUserStatus(
          mockUser.id,
          { status: testCase.to },
          mockRequest,
        );

        expect(result.newStatus).toBe(testCase.to);
        expect(result.previousStatus).toBe(testCase.from);
      }
    });
  });

  describe('getUserStatusHistory', () => {
    it('should return paginated status history', async () => {
      const mockHistory: PaginatedResponseDto<UserStatusLog> = {
        data: [
          {
            id: 'log-1',
            userId: mockUser.id,
            user: mockUser,
            previousStatus: UserStatus.ACTIVE,
            newStatus: UserStatus.INACTIVE,
            changedBy: mockAdminUser.id,
            changedByUser: mockAdminUser,
            changedByRole: Role.ADMIN,
            reason: 'Test reason',
            notes: 'Test notes',
            ipAddress: '127.0.0.1',
            userAgent: 'Test Browser',
            createdAt: new Date(),
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          nextPage: undefined,
          prevPage: undefined,
        },
      };

      jest.spyOn(service, 'getUserStatusHistory').mockResolvedValue(mockHistory);

      const result = await controller.getUserStatusHistory(mockUser.id, 1, 20, mockRequest);

      expect(service.getUserStatusHistory).toHaveBeenCalledWith(mockUser.id, 1, 20);
      expect(result).toEqual(mockHistory);
    });

    it('should use default pagination values', async () => {
      const mockHistory: PaginatedResponseDto<UserStatusLog> = {
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
          nextPage: undefined,
          prevPage: undefined,
        },
      };

      jest.spyOn(service, 'getUserStatusHistory').mockResolvedValue(mockHistory);

      await controller.getUserStatusHistory(mockUser.id, undefined, undefined, mockRequest);

      expect(service.getUserStatusHistory).toHaveBeenCalledWith(mockUser.id, 1, 20);
    });

    it('should throw ForbiddenException for non-admin user', async () => {
      mockRequest.user = { ...mockUser, role: Role.USER };

      await expect(
        controller.getUserStatusHistory(mockUser.id, 1, 20, mockRequest)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Service Methods', () => {
    let mockRepository: any;
    let mockStatusLogRepository: any;

    beforeEach(() => {
      mockRepository = {
        findOne: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
      };

      mockStatusLogRepository = {
        create: jest.fn(),
        save: jest.fn(),
        findAndCount: jest.fn(),
      };
    });

    describe('changeUserStatus', () => {
      it('should change user status and create log', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        
        // Mock user lookup
        mockRepository.findOne.mockResolvedValueOnce(mockUser);
        mockRepository.findOne.mockResolvedValueOnce(mockAdminUser);
        
        // Mock status update
        mockRepository.save.mockResolvedValue({ ...mockUser, status: UserStatus.INACTIVE });
        
        // Mock log creation
        const mockLog = {
          id: 'log-id',
          userId: mockUser.id,
          user: mockUser,
          previousStatus: UserStatus.ACTIVE,
          newStatus: UserStatus.INACTIVE,
          changedBy: mockAdminUser.id,
          changedByUser: mockAdminUser,
          changedByRole: Role.ADMIN,
          reason: 'Test reason',
          notes: 'Test notes',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Browser',
          createdAt: new Date(),
        };
        
        mockStatusLogRepository.create.mockReturnValue(mockLog);
        mockStatusLogRepository.save.mockResolvedValue(mockLog);

        const result = await usersService.changeUserStatus(
          mockUser.id,
          { status: UserStatus.INACTIVE, reason: 'Test reason', notes: 'Test notes' },
          mockAdminUser.id,
          '127.0.0.1',
          'Test Browser',
        );

        expect(result.userId).toBe(mockUser.id);
        expect(result.previousStatus).toBe(UserStatus.ACTIVE);
        expect(result.newStatus).toBe(UserStatus.INACTIVE);
        expect(mockRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ status: UserStatus.INACTIVE, isActive: false })
        );
        expect(mockStatusLogRepository.save).toHaveBeenCalledWith(mockLog);
      });

      it('should throw NotFoundException if user not found', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue(null);

        await expect(
          usersService.changeUserStatus(
            'non-existent-id',
            { status: UserStatus.INACTIVE },
            mockAdminUser.id,
          )
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException if changer is not admin', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        const regularUser = { ...mockUser, role: Role.USER };
        
        mockRepository.findOne.mockResolvedValueOnce(mockUser);
        mockRepository.findOne.mockResolvedValueOnce(regularUser);

        await expect(
          usersService.changeUserStatus(
            mockUser.id,
            { status: UserStatus.INACTIVE },
            regularUser.id,
          )
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException if trying to change admin status', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        const adminUser = { ...mockUser, role: Role.ADMIN, id: 'different-admin' };
        
        mockRepository.findOne.mockResolvedValueOnce(adminUser);
        mockRepository.findOne.mockResolvedValueOnce(mockAdminUser);

        await expect(
          usersService.changeUserStatus(
            adminUser.id,
            { status: UserStatus.INACTIVE },
            mockAdminUser.id,
          )
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException if status is already the same', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        
        mockRepository.findOne.mockResolvedValueOnce(mockUser);
        mockRepository.findOne.mockResolvedValueOnce(mockAdminUser);

        await expect(
          usersService.changeUserStatus(
            mockUser.id,
            { status: UserStatus.ACTIVE }, // Same as current status
            mockAdminUser.id,
          )
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('getUserStatusHistory', () => {
      it('should return paginated status history', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        
        mockRepository.findOne.mockResolvedValue(mockUser);
        mockStatusLogRepository.findAndCount.mockResolvedValue([
          [{ id: 'log-1', createdAt: new Date() }],
          1,
        ]);

        const result = await usersService.getUserStatusHistory(mockUser.id, 1, 10);

        expect(result.data).toHaveLength(1);
        expect(result.meta.page).toBe(1);
        expect(result.meta.limit).toBe(10);
        expect(result.meta.total).toBe(1);
      });

      it('should throw NotFoundException if user not found', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue(null);

        await expect(usersService.getUserStatusHistory('non-existent-id')).rejects.toThrow(NotFoundException);
      });
    });

    describe('canUserLogin', () => {
      it('should allow login for active users', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue({ ...mockUser, status: UserStatus.ACTIVE });

        const result = await usersService.canUserLogin(mockUser.id);

        expect(result.canLogin).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should deny login for inactive users', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue({ ...mockUser, status: UserStatus.INACTIVE });

        const result = await usersService.canUserLogin(mockUser.id);

        expect(result.canLogin).toBe(false);
        expect(result.reason).toBe('Account is inactive');
      });

      it('should deny login for suspended users', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue({ ...mockUser, status: UserStatus.SUSPENDED });

        const result = await usersService.canUserLogin(mockUser.id);

        expect(result.canLogin).toBe(false);
        expect(result.reason).toBe('Account is suspended');
      });

      it('should handle user not found', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue(null);

        const result = await usersService.canUserLogin('non-existent-id');

        expect(result.canLogin).toBe(false);
        expect(result.reason).toBe('User not found');
      });

      it('should fall back to isActive for backward compatibility', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        mockRepository.findOne.mockResolvedValue({ 
          ...mockUser, 
          status: undefined, // No status field
          isActive: false 
        });

        const result = await usersService.canUserLogin(mockUser.id);

        expect(result.canLogin).toBe(false);
        expect(result.reason).toBe('Account is inactive');
      });
    });

    describe('getUsersByStatus', () => {
      it('should return users filtered by status', async () => {
        const usersService = new UsersService(mockRepository, mockStatusLogRepository);
        
        mockRepository.findAndCount.mockResolvedValue([
          [{ ...mockUser, status: UserStatus.ACTIVE }],
          1,
        ]);

        const result = await usersService.getUsersByStatus(UserStatus.ACTIVE, 1, 10);

        expect(result.data).toHaveLength(1);
        expect(result.meta.page).toBe(1);
        expect(result.meta.limit).toBe(10);
        expect(result.meta.total).toBe(1);
        expect(mockRepository.findAndCount).toHaveBeenCalledWith({
          where: { status: UserStatus.ACTIVE },
          order: { updatedAt: 'DESC' },
          skip: 0,
          take: 10,
        });
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing IP address gracefully', async () => {
      const requestWithoutIp = {
        user: mockAdminUser,
        ip: undefined,
        connection: { remoteAddress: undefined },
        socket: { remoteAddress: undefined },
      };

      jest.spyOn(service, 'changeUserStatus').mockResolvedValue(mockStatusResponse);

      await controller.changeUserStatus(
        mockUser.id,
        mockStatusChangeDto,
        requestWithoutIp,
      );

      expect(service.changeUserStatus).toHaveBeenCalledWith(
        mockUser.id,
        mockStatusChangeDto,
        mockAdminUser.id,
        undefined,
        undefined,
      );
    });

    it('should handle empty reason and notes', async () => {
      const statusDtoWithoutReason = { status: UserStatus.SUSPENDED };
      const responseWithoutReason = {
        ...mockStatusResponse,
        newStatus: UserStatus.SUSPENDED,
        reason: undefined,
        notes: undefined,
      };

      jest.spyOn(service, 'changeUserStatus').mockResolvedValue(responseWithoutReason);

      const result = await controller.changeUserStatus(
        mockUser.id,
        statusDtoWithoutReason,
        mockRequest,
      );

      expect(result.reason).toBeUndefined();
      expect(result.notes).toBeUndefined();
    });

    it('should handle concurrent status changes', async () => {
      jest.spyOn(service, 'changeUserStatus')
        .mockResolvedValueOnce({ ...mockStatusResponse, newStatus: UserStatus.INACTIVE })
        .mockResolvedValueOnce({ 
          ...mockStatusResponse, 
          previousStatus: UserStatus.INACTIVE,
          newStatus: UserStatus.SUSPENDED 
        });

      const firstChange = await controller.changeUserStatus(
        mockUser.id,
        { status: UserStatus.INACTIVE },
        mockRequest,
      );

      const secondChange = await controller.changeUserStatus(
        mockUser.id,
        { status: UserStatus.SUSPENDED },
        mockRequest,
      );

      expect(firstChange.newStatus).toBe(UserStatus.INACTIVE);
      expect(secondChange.newStatus).toBe(UserStatus.SUSPENDED);
      expect(secondChange.previousStatus).toBe(UserStatus.INACTIVE);
    });
  });
});
