// src/tasks/tasks.scheduler.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksScheduler } from './tasks.scheduler';
import { User } from '../entities/user.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';
import { ReminderService } from '../modules/health-tasks/services/reminder.service';
import { HealthTask } from './entities/health-task.entity';
import { TasksService } from './tasks.service';

describe('TasksScheduler', () => {
  let service: TasksScheduler;
  let taskAssignmentService: TaskAssignmentService;

  const mockUserRepository = {
    find: jest.fn(),
  };

  const mockTaskAssignmentService = {
    getTodayAssignment: jest.fn(),
  };

  const mockReminderService = {
    processDueReminders: jest.fn(),
  };

  const mockHealthTaskRepository = {
    find: jest.fn(),
  };

  const mockTasksService = {
    scheduleReminderJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksScheduler,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(HealthTask),
          useValue: mockHealthTaskRepository,
        },
        {
          provide: TaskAssignmentService,
          useValue: mockTaskAssignmentService,
        },
        {
          provide: ReminderService,
          useValue: mockReminderService,
        },
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    service = module.get<TasksScheduler>(TasksScheduler);
    taskAssignmentService = module.get<TaskAssignmentService>(TaskAssignmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignDailyTasksManually', () => {
    it('should assign tasks to all active users', async () => {
      const activeUsers = [
        { id: '1', isActive: true },
        { id: '2', isActive: true },
      ];

      mockUserRepository.find.mockResolvedValue(activeUsers);
      mockTaskAssignmentService.getTodayAssignment.mockResolvedValue({});

      const result = await service.assignDailyTasksManually();

      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(mockTaskAssignmentService.getTodayAssignment).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ processed: 2, errors: 0 });
    });

    it('should handle errors and continue processing', async () => {
      const activeUsers = [
        { id: '1', isActive: true },
        { id: '2', isActive: true },
      ];

      mockUserRepository.find.mockResolvedValue(activeUsers);
      mockTaskAssignmentService.getTodayAssignment
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Assignment failed'));

      const result = await service.assignDailyTasksManually();

      expect(mockTaskAssignmentService.getTodayAssignment).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ processed: 1, errors: 1 });
    });
  });

  describe('enqueueUpcomingReminders', () => {
    it('should return early when no upcoming tasks are found', async () => {
      mockHealthTaskRepository.find.mockResolvedValue([]);

      await service.enqueueUpcomingReminders();

      expect(mockHealthTaskRepository.find).toHaveBeenCalledTimes(1);
      const queryArg = mockHealthTaskRepository.find.mock.calls[0][0];
      expect(queryArg.where.reminderTime).toBeDefined();
      expect(mockTasksService.scheduleReminderJob).not.toHaveBeenCalled();
    });

    it('should call scheduleReminderJob for each upcoming task', async () => {
      const tasks = [
        { id: 'task-1', title: 'A', reminderTime: new Date() },
        { id: 'task-2', title: 'B', reminderTime: new Date() },
        { id: 'task-3', title: 'C', reminderTime: new Date() },
      ];
      mockHealthTaskRepository.find.mockResolvedValue(tasks);
      mockTasksService.scheduleReminderJob.mockResolvedValue(undefined);

      await service.enqueueUpcomingReminders();

      expect(mockTasksService.scheduleReminderJob).toHaveBeenCalledTimes(3);
      expect(mockTasksService.scheduleReminderJob).toHaveBeenNthCalledWith(1, tasks[0]);
      expect(mockTasksService.scheduleReminderJob).toHaveBeenNthCalledWith(2, tasks[1]);
      expect(mockTasksService.scheduleReminderJob).toHaveBeenNthCalledWith(3, tasks[2]);
    });

    it('should swallow per-task errors and continue processing the rest', async () => {
      const tasks = [
        { id: 'task-1', title: 'A', reminderTime: new Date() },
        { id: 'task-2', title: 'B', reminderTime: new Date() },
        { id: 'task-3', title: 'C', reminderTime: new Date() },
      ];
      mockHealthTaskRepository.find.mockResolvedValue(tasks);
      mockTasksService.scheduleReminderJob
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('queue failure'))
        .mockResolvedValueOnce(undefined);

      await expect(service.enqueueUpcomingReminders()).resolves.toBeUndefined();
      expect(mockTasksService.scheduleReminderJob).toHaveBeenCalledTimes(3);
    });
  });
});
