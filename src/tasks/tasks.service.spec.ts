import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { HealthTask } from './entities/health-task.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { TaskStatus } from './entities/health-task.entity';

describe('TasksService', () => {
  let service: TasksService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findActiveTasks: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a task with DRAFT status', async () => {
      const createTaskDto = {
        name: 'Test Task',
        description: 'Test Description',
        categoryId: 1,
        xlmReward: 1.5,
      };
      const userId = 1;
      const expectedTask = { ...createTaskDto, id: 1, createdBy: userId, status: TaskStatus.DRAFT };

      mockRepository.create.mockReturnValue(expectedTask);
      mockRepository.save.mockResolvedValue(expectedTask);

      const result = await service.create(createTaskDto, userId);

      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createTaskDto,
        createdBy: userId,
        status: TaskStatus.DRAFT,
      });
      expect(result).toEqual(expectedTask);
    });
  });

  describe('findAll', () => {
    it('should return paginated active tasks', async () => {
      const listTasksDto = { page: 1, limit: 20 };
      const mockTasks = [{ id: 1, name: 'Task 1', status: TaskStatus.ACTIVE }];
      const mockResult = { tasks: mockTasks, total: 1 };

      mockRepository.findActiveTasks.mockResolvedValue(mockResult);

      const result = await service.findAll(listTasksDto);

      expect(result).toEqual({
        data: mockTasks,
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should filter by categoryId', async () => {
      const listTasksDto = { page: 1, limit: 20, categoryId: 2 };
      const mockResult = { tasks: [], total: 0 };

      mockRepository.findActiveTasks.mockResolvedValue(mockResult);

      await service.findAll(listTasksDto);

      expect(mockRepository.findActiveTasks).toHaveBeenCalledWith(1, 20, 2);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const mockTask = { id: 1, name: 'Task 1' };
      mockRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne(1);

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException if task not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should allow owner to update their task', async () => {
      const mockTask = { id: 1, name: 'Old Name', createdBy: 1 };
      const updateDto = { name: 'New Name' };

      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, ...updateDto });

      const result = await service.update(1, updateDto, 1, Role.HEALER);

      expect(result.name).toBe('New Name');
    });

    it('should allow admin to update any task', async () => {
      const mockTask = { id: 1, name: 'Old Name', createdBy: 2 };
      const updateDto = { name: 'New Name' };

      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, ...updateDto });

      const result = await service.update(1, updateDto, 1, Role.ADMIN);

      expect(result.name).toBe('New Name');
    });

    it('should throw ForbiddenException if non-owner tries to update', async () => {
      const mockTask = { id: 1, name: 'Task', createdBy: 2 };
      mockRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.update(1, {}, 1, Role.HEALER)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if non-admin tries to publish', async () => {
      const mockTask = { id: 1, name: 'Task', createdBy: 1 };
      const updateDto = { status: TaskStatus.ACTIVE };

      mockRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.update(1, updateDto, 1, Role.HEALER)).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to publish task', async () => {
      const mockTask = { id: 1, name: 'Task', createdBy: 1, status: TaskStatus.DRAFT };
      const updateDto = { status: TaskStatus.ACTIVE };

      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, status: TaskStatus.ACTIVE });

      const result = await service.update(1, updateDto, 2, Role.ADMIN);

      expect(result.status).toBe(TaskStatus.ACTIVE);
    });
  });

  describe('remove', () => {
    it('should throw ForbiddenException if non-admin tries to delete', async () => {
      await expect(service.remove(1, Role.HEALER)).rejects.toThrow(ForbiddenException);
    });

    it('should soft delete task by setting status to ARCHIVED', async () => {
      const mockTask = { id: 1, name: 'Task', status: TaskStatus.ACTIVE };
      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, status: TaskStatus.ARCHIVED });

      await service.remove(1, Role.ADMIN);

      expect(mockRepository.save).toHaveBeenCalledWith({
        ...mockTask,
        status: TaskStatus.ARCHIVED,
      });
    });
  });
});
