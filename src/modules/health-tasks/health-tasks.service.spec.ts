import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HealthTasksService } from './health-tasks.service';
import { TaskStatus } from '../../tasks/enums/task-status.enum';
import { TaskDifficulty } from '../../tasks/enums/task-difficulty.enum';
import { TaskCategory } from '../../database/entities/task-category.entity';

const mockQueryBuilder: any = {};

const mockTaskRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  softDelete: jest.fn(),
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
  manager: {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  },
};

const mockCategoryRepository = {
  findOne: jest.fn(),
};

const mockTagRepository = {
  findByIds: jest.fn(),
};

const mockPriorityService = {
  resolvePriority: jest.fn().mockReturnValue('medium'),
  sortByPriority: jest.fn((tasks) => tasks),
  buildOverdueAlert: jest.fn().mockReturnValue(null),
};

const mockActivityLogService = {
  logTaskChange: jest.fn(),
  getActivityHistory: jest.fn(),
};

describe('HealthTasksService', () => {
  let service: HealthTasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockQueryBuilder, {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
      getMany: jest.fn().mockResolvedValue([]),
    });

    service = new HealthTasksService(
      mockTaskRepository as any,
      mockCategoryRepository as any,
      mockTagRepository as any,
      mockPriorityService as any,
      mockActivityLogService as any
    );
  });

  describe('findOne', () => {
    it('loads the task with its category and tags', async () => {
      const task = { id: 'task-1' };
      mockTaskRepository.findOne.mockResolvedValue(task);

      await expect(service.findOne('task-1')).resolves.toBe(task);
      expect(mockTaskRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        relations: ['category', 'tags'],
      });
    });
  });

  describe('findByDifficulty', () => {
    it('filters on the JSONB targetProfile difficulty', async () => {
      const tasks = [{ id: 'task-1' }];
      mockQueryBuilder.getMany.mockResolvedValue(tasks);

      await expect(service.findByDifficulty(TaskDifficulty.EASY)).resolves.toBe(tasks);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        "task.targetProfile->>'difficulty' = :difficulty",
        { difficulty: TaskDifficulty.EASY }
      );
    });
  });

  describe('create', () => {
    it('creates a task and links its category', async () => {
      const created: any = { title: 'Walk', category: 'nutrition' };
      const category = { id: 'cat-1' };
      mockTaskRepository.create.mockReturnValue(created);
      mockCategoryRepository.findOne.mockResolvedValue(category);
      mockTagRepository.findByIds.mockResolvedValue([{ id: 'tag-1' }]);
      mockTaskRepository.save.mockImplementation(async (task: any) => task);

      const result: any = await service.create({
        title: 'Walk',
        description: 'Daily walk',
        category: 'nutrition' as any,
        categoryId: 'cat-1',
        tagIds: ['11111111-1111-4111-8111-111111111111'],
      });

      expect(mockTaskRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Walk', description: 'Daily walk' })
      );
      expect(result.categoryId).toBe('cat-1');
      expect(result.taskCategory).toBe(category);
      expect(result.tags).toEqual([{ id: 'tag-1' }]);
    });
  });

  describe('update', () => {
    it('clears the category when an empty categoryId is supplied', async () => {
      const task: any = {
        id: 'task-1',
        title: 'Walk',
        status: TaskStatus.DRAFT,
        targetProfile: {},
        categoryId: 'cat-1',
        taskCategory: { id: 'cat-1' },
      };
      mockTaskRepository.findOne.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (saved: any) => saved);

      const result: any = await service.update('task-1', {
        categoryId: '',
      } as any);

      expect(result.categoryId).toBeNull();
      expect(result.taskCategory).toBeNull();
    });

    it('logs an activity entry when tracked fields change', async () => {
      const task: any = {
        id: 'task-1',
        title: 'Walk',
        status: TaskStatus.DRAFT,
        targetProfile: {},
      };
      mockTaskRepository.findOne.mockResolvedValue(task);
      mockTaskRepository.save.mockImplementation(async (saved: any) => saved);

      await service.update('task-1', { title: 'Run' } as any, 'user-1');

      expect(mockActivityLogService.logTaskChange).toHaveBeenCalledWith(
        'task-1',
        'user-1',
        'task.updated',
        expect.objectContaining({
          changes: expect.arrayContaining([{ field: 'title', before: 'Walk', after: 'Run' }]),
        })
      );
    });

    it('throws when the task does not exist', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { title: 'Run' } as any)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('remove', () => {
    it('soft deletes a task owned by the caller', async () => {
      mockTaskRepository.findOne.mockResolvedValue({
        id: 'task-1',
        createdBy: 'user-1',
      });

      await service.remove('task-1', 'user-1');

      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockTaskRepository.softDelete).toHaveBeenCalledWith('task-1');
    });

    it('forbids deleting another user task', async () => {
      mockTaskRepository.findOne.mockResolvedValue({
        id: 'task-1',
        createdBy: 'user-1',
      });

      await expect(service.remove('task-1', 'user-2')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockTaskRepository.softDelete).not.toHaveBeenCalled();
    });

    it('throws when the task does not exist', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
