import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { TaskCompletion } from '../../../database/entities/task-completion.entity';
import { HealthTask, TaskCategory } from '../../../tasks/entities/health-task.entity';
import { User } from '../../../entities/user.entity';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let completionRepo: Repository<TaskCompletion>;
  let taskRepo: Repository<HealthTask>;
  let userRepo: Repository<User>;

  const mockCompletionRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
      getRawOne: jest.fn(),
    })),
  };

  const mockTaskRepo = {
    count: jest.fn(),
  };

  const mockUserRepo = {
    // Not used in analytics service
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
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
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    completionRepo = module.get<Repository<TaskCompletion>>(
      getRepositoryToken(TaskCompletion),
    );
    taskRepo = module.get<Repository<HealthTask>>(
      getRepositoryToken(HealthTask),
    );
  });

  afterEach(() => {
    service.clearCache();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should return cached dashboard if available', async () => {
      const mockDashboard = {
        completionRate: { overall: 75 },
        taskStatistics: { totalTasks: 10 },
        trends: { daily: [], weekly: [], monthly: [] },
        categoryBreakdown: [],
        lastUpdated: new Date(),
      };

      // First call to populate cache
      mockTaskRepo.count.mockResolvedValue(10);
      mockCompletionRepo.count.mockResolvedValue(7);
      mockCompletionRepo.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ avgTime: null }),
      });

      await service.getDashboard();

      // Second call should use cache
      const result = await service.getDashboard();
      expect(result).toBeDefined();
      expect(mockTaskRepo.count).toHaveBeenCalledTimes(1); // Should use cache
    });

    it('should calculate completion rate correctly', async () => {
      mockTaskRepo.count.mockResolvedValue(10);
      mockCompletionRepo.count.mockResolvedValue(7);
      mockCompletionRepo.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { category: TaskCategory.NUTRITION, total: '5', completed: '3' },
          { category: TaskCategory.FITNESS, total: '5', completed: '4' },
        ]),
        getRawOne: jest.fn().mockResolvedValue({ avgTime: null }),
      });

      const result = await service.getDashboard();

      expect(result.completionRate.overall).toBe(70); // 7/10 * 100
      expect(result.completionRate.byCategory[TaskCategory.NUTRITION]).toBe(60); // 3/5 * 100
      expect(result.completionRate.byCategory[TaskCategory.FITNESS]).toBe(80); // 4/5 * 100
    });
  });

  describe('calculateTaskStatistics', () => {
    it('should calculate task statistics correctly', async () => {
      mockTaskRepo.count
        .mockResolvedValueOnce(15) // totalTasks
        .mockResolvedValueOnce(12); // activeTasks
      mockCompletionRepo.count.mockResolvedValue(8);

      mockCompletionRepo.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ avgTime: '2.5' }) // average completion time
          .mockResolvedValueOnce({
            taskId: 'task-1',
            title: 'Test Task',
            completionCount: '5',
          }), // most completed task
      });

      const stats = await (service as any).calculateTaskStatistics();

      expect(stats.totalTasks).toBe(15);
      expect(stats.activeTasks).toBe(12);
      expect(stats.completedTasks).toBe(8);
      expect(stats.averageCompletionTime).toBe(2.5);
      expect(stats.mostCompletedTask).toEqual({
        taskId: 'task-1',
        title: 'Test Task',
        completionCount: 5,
      });
    });
  });

  describe('calculateTrends', () => {
    it('should calculate daily trends correctly', async () => {
      const mockTrends = [
        {
          date: new Date('2024-01-01'),
          completions: '10',
          completed: '8',
        },
        {
          date: new Date('2024-01-02'),
          completions: '12',
          completed: '10',
        },
      ];

      mockCompletionRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockTrends),
      });

      const trends = await (service as any).calculateTrends('daily');

      expect(trends).toHaveLength(2);
      expect(trends[0].completions).toBe(10);
      expect(trends[0].completionRate).toBe(80); // 8/10 * 100
      expect(trends[1].completions).toBe(12);
      expect(trends[1].completionRate).toBeCloseTo(83.33); // 10/12 * 100
    });
  });

  describe('calculateCategoryBreakdown', () => {
    it('should calculate category breakdown correctly', async () => {
      const mockCategories = [
        {
          category: TaskCategory.NUTRITION,
          totalTasks: '5',
          completedTasks: '3',
          averageReward: '10.5',
        },
        {
          category: TaskCategory.FITNESS,
          totalTasks: '7',
          completedTasks: '5',
          averageReward: '15.0',
        },
      ];

      mockCompletionRepo.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockCategories),
      });

      const breakdown = await (service as any).calculateCategoryBreakdown();

      expect(breakdown).toHaveLength(2);
      expect(breakdown[0].category).toBe(TaskCategory.NUTRITION);
      expect(breakdown[0].totalTasks).toBe(5);
      expect(breakdown[0].completedTasks).toBe(3);
      expect(breakdown[0].completionRate).toBe(60); // 3/5 * 100
      expect(breakdown[0].averageReward).toBe(10.5);
    });
  });

  describe('cache management', () => {
    it('should clear cache when clearCache is called', () => {
      // Populate cache
      (service as any).setCached('test', { data: 'test' });

      service.clearCache();

      const cached = (service as any).getCached('test');
      expect(cached).toBeNull();
    });
  });
});