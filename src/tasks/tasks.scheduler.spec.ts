// src/tasks/tasks.scheduler.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksScheduler } from './tasks.scheduler';
import { User } from '../entities/user.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';

describe('TasksScheduler', () => {
  let service: TasksScheduler;
  let taskAssignmentService: TaskAssignmentService;

  const mockUserRepository = {
    find: jest.fn(),
  };

  const mockTaskAssignmentService = {
    getTodayAssignment: jest.fn(),
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
          provide: TaskAssignmentService,
          useValue: mockTaskAssignmentService,
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
});