import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { HealthTask } from './entities/health-task.entity';
import { QueueService } from '../shared/queue/queue.service';
import {
  NOTIFICATION_QUEUE,
  TASK_REMINDER_JOB,
} from '../queue/queue.constants';
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
    softDelete: jest.fn(),
  };

  const mockQueueService = {
    addDelayedJob: jest.fn(),
    addJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockRepository,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
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
        title: 'Test Task',
        description: 'Test Description',
        categoryId: 1,
        xlmReward: 1.5,
      };
      const userId = '1';
      const expectedTask = {
        ...createTaskDto,
        id: 1,
        createdBy: userId,
        status: TaskStatus.DRAFT,
      };

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
      const mockTasks = [{ id: 1, title: 'Task 1', status: TaskStatus.ACTIVE }];

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
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
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

      expect(andWhere).toHaveBeenCalledWith('task.categoryId = :categoryId', {
        categoryId: 2,
      });
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const mockTask = { id: 1, name: 'Task 1', status: TaskStatus.ACTIVE };
      mockRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException if task not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });

    it('should return task even if status is not ACTIVE', async () => {
      const mockTask = { id: 1, name: 'Task 1', status: TaskStatus.DRAFT };
      mockRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTask);
      expect(result.status).toBe(TaskStatus.DRAFT);
    });
  });

  describe('update', () => {
    it('should allow owner to update their task', async () => {
      const mockTask = { id: '1', title: 'Old Name', createdBy: '1' };
      const updateDto = { title: 'New Name' };

      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, ...updateDto });

      const result = await service.update('1', updateDto, '1', Role.HEALER);

      expect(result.title).toBe('New Name');
    });

    it('should allow admin to update any task', async () => {
      const mockTask = { id: '1', title: 'Old Name', createdBy: '2' };
      const updateDto = { title: 'New Name' };

      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({ ...mockTask, ...updateDto });

      const result = await service.update('1', updateDto, '1', Role.ADMIN);

      expect(result.title).toBe('New Name');
    });

    it('should throw ForbiddenException if non-owner tries to update', async () => {
      const mockTask = { id: '1', title: 'Task', createdBy: '2' };
      mockRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.update('1', {}, '1', Role.HEALER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if non-admin tries to publish', async () => {
      const mockTask = { id: '1', title: 'Task', createdBy: '1' };
      const updateDto = { status: TaskStatus.ACTIVE };

      mockRepository.findOne.mockResolvedValue(mockTask);

      await expect(
        service.update('1', updateDto, '1', Role.HEALER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to publish task', async () => {
      const mockTask = {
        id: '1',
        title: 'Task',
        createdBy: '1',
        status: TaskStatus.DRAFT,
      };
      const updateDto = { status: TaskStatus.ACTIVE };

      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.save.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.ACTIVE,
      });

      const result = await service.update('1', updateDto, '2', Role.ADMIN);

      expect(result.status).toBe(TaskStatus.ACTIVE);
    });
  });

  describe('remove', () => {
    it('should soft-delete the task', async () => {
      const mockTask = { id: '1', title: 'Task', status: TaskStatus.ACTIVE };
      mockRepository.findOne.mockResolvedValue(mockTask);
      mockRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove('1');

      expect(mockRepository.softDelete).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('scheduleReminderJob', () => {
    it('should be a no-op when reminderTime is undefined', async () => {
      const task = {
        id: 'task-1',
        title: 'Task',
        createdBy: 'user-1',
      } as unknown as HealthTask;

      await service.scheduleReminderJob(task);

      expect(mockQueueService.addDelayedJob).not.toHaveBeenCalled();
    });

    it('should be a no-op when reminderTime is in the past', async () => {
      const past = new Date(Date.now() - 60_000); // 1 minute ago
      const task = {
        id: 'task-1',
        title: 'Task',
        createdBy: 'user-1',
        reminderTime: past,
      } as unknown as HealthTask;

      await service.scheduleReminderJob(task);

      expect(mockQueueService.addDelayedJob).not.toHaveBeenCalled();
    });

    it('should enqueue a delayed job with deterministic jobId for a future reminder', async () => {
      const future = new Date(Date.now() + 60 * 60_000); // 1 hour from now
      const task = {
        id: 'task-1',
        title: 'Task',
        createdBy: 'user-1',
        reminderTime: future,
      } as unknown as HealthTask;

      await service.scheduleReminderJob(task);

      expect(mockQueueService.addDelayedJob).toHaveBeenCalledTimes(1);
      const [queueName, jobName, payload, delayMs, options] =
        mockQueueService.addDelayedJob.mock.calls[0];
      expect(queueName).toBe(NOTIFICATION_QUEUE);
      expect(jobName).toBe(TASK_REMINDER_JOB);
      expect(payload).toMatchObject({
        taskId: 'task-1',
        userId: 'user-1',
        taskTitle: 'Task',
      });
      expect(payload.remindAt).toBe(future);
      expect(delayMs).toBeGreaterThan(0);
      expect(options.jobId).toBe(`task-reminder:task-1:${future.getTime()}`);
      expect(options.attempts).toBe(3);
    });
  });

  describe('create with reminderTime', () => {
    it('should call scheduleReminderJob after saving when reminderTime is set', async () => {
      const future = new Date(Date.now() + 60 * 60_000);
      const createTaskDto = {
        title: 'Task',
        description: 'd',
        categoryId: 1,
        xlmReward: 1,
        reminderTime: future.toISOString(),
      };
      const savedTask = {
        id: 'task-1',
        title: 'Task',
        createdBy: 'user-1',
        reminderTime: future,
        status: TaskStatus.DRAFT,
      };

      mockRepository.create.mockReturnValue(savedTask);
      mockRepository.save.mockResolvedValue(savedTask);

      await service.create(createTaskDto as any, 'user-1');

      expect(mockQueueService.addDelayedJob).toHaveBeenCalledTimes(1);
    });

    it('should not enqueue when reminderTime is not set', async () => {
      const createTaskDto = {
        title: 'Task',
        description: 'd',
        categoryId: 1,
        xlmReward: 1,
      };
      const savedTask = {
        id: 'task-1',
        title: 'Task',
        createdBy: 'user-1',
        status: TaskStatus.DRAFT,
      };

      mockRepository.create.mockReturnValue(savedTask);
      mockRepository.save.mockResolvedValue(savedTask);

      await service.create(createTaskDto, 'user-1');

      expect(mockQueueService.addDelayedJob).not.toHaveBeenCalled();
    });
  });

  describe('update with reminderTime', () => {
    it('should call scheduleReminderJob when reminderTime is in the patch', async () => {
      const future = new Date(Date.now() + 60 * 60_000);
      const existingTask = {
        id: '1',
        title: 'Task',
        createdBy: '1',
      };
      const updateDto = { reminderTime: future.toISOString() };

      mockRepository.findOne.mockResolvedValue(existingTask);
      mockRepository.save.mockResolvedValue({
        ...existingTask,
        reminderTime: future,
      });

      await service.update('1', updateDto as any, '1', Role.HEALER);

      expect(mockQueueService.addDelayedJob).toHaveBeenCalledTimes(1);
    });

    it('should NOT call scheduleReminderJob when reminderTime is not in the patch', async () => {
      const existingTask = {
        id: '1',
        title: 'Old',
        createdBy: '1',
      };
      const updateDto = { title: 'New' };

      mockRepository.findOne.mockResolvedValue(existingTask);
      mockRepository.save.mockResolvedValue({ ...existingTask, ...updateDto });

      await service.update('1', updateDto, '1', Role.HEALER);

      expect(mockQueueService.addDelayedJob).not.toHaveBeenCalled();
    });
  });
});
