import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompletionService } from './completion.service';
import { TaskCompletion } from '../../../tasks/entities/task-completion.entity';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { User } from '../../../entities/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';

describe('CompletionService', () => {
  let service: CompletionService;
  let completionRepo: Repository<TaskCompletion>;
  let taskRepo: Repository<HealthTask>;
  let userRepo: Repository<User>;

  const mockCompletionRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockTaskRepo = {
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompletionService,
        {
          provide: getRepositoryToken(TaskCompletion),
          useValue: mockCompletionRepo,
        },
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockTaskRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<CompletionService>(CompletionService);
    completionRepo = module.get<Repository<TaskCompletion>>(
      getRepositoryToken(TaskCompletion),
    );
    taskRepo = module.get<Repository<HealthTask>>(
      getRepositoryToken(HealthTask),
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('markTaskComplete', () => {
    it('should mark task as complete', async () => {
      const userId = 'user-1';
      const taskId = 'task-1';
      const dto = { taskId, completionPercentage: 100, notes: 'Completed successfully' };

      const mockTask = { id: taskId, title: 'Test Task', createdBy: userId };
      const mockUser = { id: userId, firstName: 'John' };
      const mockCompletion = {
        id: 'completion-1',
        userId,
        taskId,
        isCompleted: true,
        completionPercentage: 100,
        completedAt: expect.any(Date),
        notes: 'Completed successfully',
      };

      mockTaskRepo.findOne.mockResolvedValue(mockTask);
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockCompletionRepo.findOne.mockResolvedValue(null);
      mockCompletionRepo.create.mockReturnValue(mockCompletion);
      mockCompletionRepo.save.mockResolvedValue(mockCompletion);

      const result = await service.markTaskComplete(userId, dto);

      expect(result).toEqual(mockCompletion);
      expect(mockCompletionRepo.create).toHaveBeenCalledWith({
        userId,
        taskId,
        isCompleted: true,
        completionPercentage: 100,
        completedAt: expect.any(Date),
        notes: 'Completed successfully',
      });
    });

    it('should throw NotFoundException if task not found', async () => {
      const userId = 'user-1';
      const taskId = 'task-1';
      const dto = { taskId };

      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(service.markTaskComplete(userId, dto)).rejects.toThrow(
        'Task task-1 not found',
      );
    });

    it('should throw BadRequestException for invalid completion percentage', async () => {
      const userId = 'user-1';
      const taskId = 'task-1';
      const dto = { taskId, completionPercentage: 150 };

      const mockTask = { id: taskId, title: 'Test Task', createdBy: userId };
      mockUserRepo.findOne.mockResolvedValue({ id: userId });
      mockCompletionRepo.findOne.mockResolvedValue(null);
      mockTaskRepo.findOne.mockResolvedValue(mockTask);

      await expect(service.markTaskComplete(userId, dto)).rejects.toThrow(
        'Completion percentage must be between 0 and 100',
      );
    });

    it('should reject completion by a user who does not own the task', async () => {
      mockTaskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        createdBy: 'owner-1',
      });

      await expect(
        service.markTaskComplete('other-user', { taskId: 'task-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockCompletionRepo.save).not.toHaveBeenCalled();
    });

    it('should allow an admin to complete a task they do not own', async () => {
      const task = { id: 'task-1', createdBy: 'owner-1' };
      const completion = { id: 'completion-1', isCompleted: true };
      mockTaskRepo.findOne.mockResolvedValue(task);
      mockUserRepo.findOne.mockResolvedValue({ id: 'admin-1' });
      mockCompletionRepo.findOne.mockResolvedValue(null);
      mockCompletionRepo.create.mockReturnValue(completion);
      mockCompletionRepo.save.mockResolvedValue(completion);

      await expect(
        service.markTaskComplete(
          'admin-1',
          { taskId: 'task-1' },
          Role.ADMIN,
        ),
      ).resolves.toBe(completion);
    });

    it('should return the existing completion for a duplicate request', async () => {
      const taskId = 'task-1';
      const existingCompletion = {
        id: 'completion-1',
        userId: 'user-1',
        taskId,
        isCompleted: true,
      };
      mockTaskRepo.findOne.mockResolvedValue({
        id: taskId,
        createdBy: 'user-1',
      });
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
      mockCompletionRepo.findOne.mockResolvedValue(existingCompletion);

      const result = await service.markTaskComplete('user-1', { taskId });

      expect(result).toBe(existingCompletion);
      expect(mockCompletionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('markTaskIncomplete', () => {
    it('should mark task as incomplete', async () => {
      const userId = 'user-1';
      const taskId = 'task-1';
      const dto = { taskId, notes: 'Not completed' };

      const mockTask = { id: taskId, title: 'Test Task', createdBy: userId };
      const mockUser = { id: userId, firstName: 'John' };
      const mockCompletion = {
        id: 'completion-1',
        userId,
        taskId,
        isCompleted: false,
        completionPercentage: 0,
        completedAt: null,
        notes: 'Not completed',
      };

      mockTaskRepo.findOne.mockResolvedValue(mockTask);
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockCompletionRepo.create.mockReturnValue(mockCompletion);
      mockCompletionRepo.save.mockResolvedValue(mockCompletion);

      const result = await service.markTaskIncomplete(userId, dto);

      expect(result).toEqual(mockCompletion);
      expect(mockCompletionRepo.create).toHaveBeenCalledWith({
        userId,
        taskId,
        isCompleted: false,
        completionPercentage: 0,
        completedAt: null,
        notes: 'Not completed',
      });
    });
  });

  describe('getCompletionHistory', () => {
    it('should return completion history for a task', async () => {
      const userId = 'user-1';
      const taskId = 'task-1';
      const mockHistory = [
        {
          id: 'completion-1',
          userId,
          taskId,
          isCompleted: true,
          completionPercentage: 100,
          createdAt: new Date(),
          task: { id: taskId, title: 'Test Task' },
        },
      ];

      mockCompletionRepo.find.mockResolvedValue(mockHistory);

      const result = await service.getCompletionHistory(userId, taskId);

      expect(result).toEqual(mockHistory);
      expect(mockCompletionRepo.find).toHaveBeenCalledWith({
        where: { userId, taskId },
        order: { createdAt: 'DESC' },
        relations: ['task'],
      });
    });
  });

  describe('getCompletionMetrics', () => {
    it('should return completion metrics for a user', async () => {
      const userId = 'user-1';
      const mockUser = {
        id: userId,
        healthTasks: [
          { id: 'task-1', title: 'Task 1' },
          { id: 'task-2', title: 'Task 2' },
        ],
      };
      const mockCompletions = [
        {
          userId,
          taskId: 'task-1',
          isCompleted: true,
          completedAt: new Date(),
          createdAt: new Date(),
        },
        {
          userId,
          taskId: 'task-2',
          isCompleted: false,
          completedAt: null,
          createdAt: new Date(),
        },
      ];

      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockCompletionRepo.find.mockResolvedValue(mockCompletions);

      const result = await service.getCompletionMetrics(userId);

      expect(result.totalTasks).toBe(2);
      expect(result.completedTasks).toBe(1);
      expect(result.completionRate).toBe(50);
    });
  });
});