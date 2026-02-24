import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { HealthTask } from './entities/health-task.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { TaskStatus } from './enums/task-status.enum';

describe('TasksService', () => {
  let service: TasksService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
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
      
      const getManyAndCount = jest.fn().mockResolvedValue([mockTasks, 1]);
      mockRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount,
      });

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
      
      const andWhere = jest.fn().mockReturnThis();
      const getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
      
      mockRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere,
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount,
      });

      await service.findAll(listTasksDto);

      expect(andWhere).toHaveBeenCalledWith('task.categoryId = :categoryId', { categoryId: 2 });
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const mockTask = { id: 1, name: 'Task 1', status: TaskStatus.ACTIVE };
      mockRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne(1);

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException if task not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('should return task even if status is not ACTIVE', async () => {
      const mockTask = { id: 1, name: 'Task 1', status: TaskStatus.DRAFT };
      mockRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne(1);

      expect(result).toEqual(mockTask);
      expect(result.status).toBe(TaskStatus.DRAFT);
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
    it('should archive task by setting status to ARCHIVED', async () => {
      const mockTask = { id: 1, name: 'Task', status: TaskStatus.ACTIVE };
      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, status: TaskStatus.ARCHIVED });

      await service.remove(1);

      expect(mockRepository.save).toHaveBeenCalledWith({
        ...mockTask,
        status: TaskStatus.ARCHIVED,
      });
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
