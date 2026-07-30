import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './services/admin-users.service';
import { Role } from '@modules/auth/enums/role.enum';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let service: AdminUsersService;

  const mockAdminUsersService = {
    getUserTasks: jest.fn(),
    createAdminUser: jest.fn(),
    listUsers: jest.fn(),
    getUserById: jest.fn(),
    changeRole: jest.fn(),
    suspendUser: jest.fn(),
    reactivateUser: jest.fn(),
    deleteUser: jest.fn(),
    searchUsers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        {
          provide: AdminUsersService,
          useValue: mockAdminUsersService,
        },
      ],
    }).compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
    service = module.get<AdminUsersService>(AdminUsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserTasks', () => {
    it('should return tasks for a specific user', async () => {
      const userId = 'user-123';
      const mockTasks = {
        user: {
          id: userId,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: Role.USER,
        },
        tasks: [
          { id: 'task-1', title: 'Task 1', status: 'ACTIVE' },
          { id: 'task-2', title: 'Task 2', status: 'COMPLETED' },
        ],
      };

      mockAdminUsersService.getUserTasks.mockResolvedValue(mockTasks);

      const result = await controller.getUserTasks(userId);

      expect(service.getUserTasks).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockTasks);
      expect(result.tasks).toHaveLength(2);
    });

    it('should return empty tasks array when user has no tasks', async () => {
      const userId = 'user-456';
      const mockTasks = {
        user: {
          id: userId,
          email: 'empty@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: Role.USER,
        },
        tasks: [],
      };

      mockAdminUsersService.getUserTasks.mockResolvedValue(mockTasks);

      const result = await controller.getUserTasks(userId);

      expect(service.getUserTasks).toHaveBeenCalledWith(userId);
      expect(result.tasks).toEqual([]);
    });

    it('should throw 404 when user not found', async () => {
      const userId = 'nonexistent';
      mockAdminUsersService.getUserTasks.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(controller.getUserTasks(userId)).rejects.toThrow(
        'User not found',
      );
      expect(service.getUserTasks).toHaveBeenCalledWith(userId);
    });
  });

  describe('createAdmin', () => {
    it('should create an admin user', async () => {
      const req = { user: { sub: 'admin-1' } };
      const dto = {
        email: 'admin@example.com',
        password: 'Password123!',
        firstName: 'Admin',
        lastName: 'User',
        country: 'US',
      };
      const mockUser = { id: 'admin-2', ...dto, role: Role.ADMIN };

      mockAdminUsersService.createAdminUser.mockResolvedValue(mockUser);

      const result = await controller.createAdmin(req, dto);

      expect(service.createAdminUser).toHaveBeenCalledWith(req.user.sub, dto);
      expect(result).toEqual(mockUser);
    });
  });

  describe('list', () => {
    it('should return paginated users', async () => {
      const dto = { page: 1, limit: 20 };
      const mockResult = {
        data: [{ id: 'user-1', email: 'user@example.com' }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      mockAdminUsersService.listUsers.mockResolvedValue(mockResult);

      const result = await controller.list(dto);

      expect(service.listUsers).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getById', () => {
    it('should return user by id', async () => {
      const userId = 'user-123';
      const mockUser = { id: userId, email: 'test@example.com' };

      mockAdminUsersService.getUserById.mockResolvedValue(mockUser);

      const result = await controller.getById(userId);

      expect(service.getUserById).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockUser);
    });
  });

  describe('changeRole', () => {
    it('should change user role', async () => {
      const req = { user: { sub: 'admin-1' } };
      const userId = 'user-123';
      const dto = { role: Role.ADMIN };
      const mockUser = { id: userId, role: Role.ADMIN };

      mockAdminUsersService.changeRole.mockResolvedValue(mockUser);

      const result = await controller.changeRole(req, userId, dto);

      expect(service.changeRole).toHaveBeenCalledWith(req.user.sub, userId, dto.role);
      expect(result).toEqual(mockUser);
    });
  });

  describe('suspend', () => {
    it('should suspend a user', async () => {
      const req = { user: { sub: 'admin-1' } };
      const userId = 'user-123';
      const mockUser = { id: userId, isActive: false };

      mockAdminUsersService.suspendUser.mockResolvedValue(mockUser);

      const result = await controller.suspend(req, userId);

      expect(service.suspendUser).toHaveBeenCalledWith(req.user.sub, userId);
      expect(result.isActive).toBe(false);
    });
  });

  describe('reactivate', () => {
    it('should reactivate a user', async () => {
      const req = { user: { sub: 'admin-1' } };
      const userId = 'user-123';
      const mockUser = { id: userId, isActive: true };

      mockAdminUsersService.reactivateUser.mockResolvedValue(mockUser);

      const result = await controller.reactivate(req, userId);

      expect(service.reactivateUser).toHaveBeenCalledWith(req.user.sub, userId);
      expect(result.isActive).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete a user', async () => {
      const req = { user: { sub: 'admin-1' } };
      const userId = 'user-123';
      const mockResult = { message: 'User deleted successfully' };

      mockAdminUsersService.deleteUser.mockResolvedValue(mockResult);

      const result = await controller.delete(req, userId);

      expect(service.deleteUser).toHaveBeenCalledWith(req.user.sub, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('search', () => {
    it('should search users by query', async () => {
      const query = 'john';
      const mockResult = { data: [{ id: 'user-1', email: 'john@example.com' }], total: 1 };

      mockAdminUsersService.searchUsers.mockResolvedValue(mockResult);

      const result = await controller.search(query);

      expect(service.searchUsers).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockResult);
    });
  });
});
