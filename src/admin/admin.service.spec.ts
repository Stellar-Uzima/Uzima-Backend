import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AdminUsersService } from './services/admin-users.service';
import { User } from 'src/entities/user.entity';
import { AuditService } from 'src/audit/audit.service';
import { Role } from 'src/auth/enums/role.enum';
import { ListUsersDto } from './dto/list-users.dto';

const mockRedisClient = {
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: () => mockRedisClient,
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    role: Role.USER,
    country: 'US',
    isActive: true,
    stellarWalletAddress: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const adminId = 'admin-uuid-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAdminUser', () => {
    const createDto = {
      email: 'newadmin@example.com',
      firstName: 'New',
      lastName: 'Admin',
      password: 'SecurePass123',
      country: 'US',
    };

    it('should create a user with Role.ADMIN and hashed password', async () => {
      const savedUser = {
        id: 'new-admin-uuid',
        ...createDto,
        password: 'hashed-password',
        role: Role.ADMIN,
        isActive: true,
        isVerified: true,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedUser);
      mockUserRepository.save.mockResolvedValue(savedUser);

      const result = await service.createAdminUser(adminId, createDto);

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: createDto.email,
          password: 'hashed-password',
          role: Role.ADMIN,
          isActive: true,
          isVerified: true,
        }),
      );
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe(createDto.email);
    });

    it('should call auditService.logAction after creating admin', async () => {
      const savedUser = {
        id: 'new-admin-uuid',
        ...createDto,
        password: 'hashed-password',
        role: Role.ADMIN,
        isActive: true,
        isVerified: true,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedUser);
      mockUserRepository.save.mockResolvedValue(savedUser);

      await service.createAdminUser(adminId, createDto);

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        adminId,
        `Created admin user new-admin-uuid`,
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.createAdminUser(adminId, createDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listUsers', () => {
    const mockQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    beforeEach(() => {
      mockUserRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should return paginated users with default page=1, limit=20', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockUser], 1]);

      const result = await service.listUsers({} as any);

      expect(result).toEqual({
        data: [mockUser],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('should apply custom pagination', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 50]);

      const result = await service.listUsers({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result.meta).toEqual({
        total: 50,
        page: 3,
        limit: 10,
        totalPages: 5,
      });
    });

    it('should apply country filter when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ country: 'KE' } as ListUsersDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.country = :country',
        { country: 'KE' },
      );
    });

    it('should apply role filter when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ role: Role.HEALER } as ListUsersDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.role = :role',
        { role: Role.HEALER },
      );
    });

    it('should apply isActive filter when provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ isActive: false } as ListUsersDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.isActive = :active',
        { active: false },
      );
    });

    it('should apply search filter with ILIKE on name and email', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listUsers({ search: 'jane' } as ListUsersDto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
        { search: '%jane%' },
      );
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserById('user-uuid-1');

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-uuid-1' } }),
      );
    });

    it('should throw BadRequestException when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('changeRole', () => {
    it('should update user role and return updated user', async () => {
      const updatedUser = { ...mockUser, role: Role.HEALER };
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.changeRole(
        adminId,
        'user-uuid-1',
        Role.HEALER,
      );

      expect(result.role).toBe(Role.HEALER);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when admin changes own role', async () => {
      await expect(
        service.changeRole(adminId, adminId, Role.USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call auditService.logAction with correct parameters', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        role: Role.ADMIN,
      });

      await service.changeRole(adminId, 'user-uuid-1', Role.ADMIN);

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        adminId,
        'Changed role of user user-uuid-1 to ADMIN',
      );
    });

    it('should throw BadRequestException when target user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.changeRole(adminId, 'nonexistent', Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('suspendUser', () => {
    it('should set isActive to false and return updated user', async () => {
      const suspended = { ...mockUser, isActive: false };
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue(suspended);

      const result = await service.suspendUser(adminId, 'user-uuid-1');

      expect(result.isActive).toBe(false);
    });

    it('should throw ForbiddenException for self-suspension', async () => {
      await expect(
        service.suspendUser(adminId, adminId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should invalidate Redis refresh tokens', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await service.suspendUser(adminId, 'user-uuid-1');

      expect(mockRedisClient.del).toHaveBeenCalledWith('refresh:user-uuid-1');
    });

    it('should call auditService.logAction with correct parameters', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await service.suspendUser(adminId, 'user-uuid-1');

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        adminId,
        'Suspended user user-uuid-1',
      );
    });

    it('should throw BadRequestException when target user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.suspendUser(adminId, 'nonexistent'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reactivateUser', () => {
    const suspendedUser = { ...mockUser, isActive: false };

    it('should set isActive to true and return updated user', async () => {
      const reactivated = { ...suspendedUser, isActive: true };
      mockUserRepository.findOne.mockResolvedValue({ ...suspendedUser });
      mockUserRepository.save.mockResolvedValue(reactivated);

      const result = await service.reactivateUser(adminId, 'user-uuid-1');

      expect(result.isActive).toBe(true);
    });

    it('should throw ForbiddenException for self-reactivation', async () => {
      await expect(
        service.reactivateUser(adminId, adminId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call auditService.logAction with correct parameters', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...suspendedUser });
      mockUserRepository.save.mockResolvedValue({
        ...suspendedUser,
        isActive: true,
      });

      await service.reactivateUser(adminId, 'user-uuid-1');

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        adminId,
        'Reactivated user user-uuid-1',
      );
    });

    it('should throw BadRequestException when target user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.reactivateUser(adminId, 'nonexistent'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
