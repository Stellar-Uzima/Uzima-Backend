import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskAnalyticsService } from './task-analytics.service';
import {
  TaskCompletion,
  TaskCompletionStatus,
} from '../../tasks/entities/task-completion.entity';
import { HealthTask, TaskCategory } from '../../tasks/entities/health-task.entity';

describe('TaskAnalyticsService', () => {
  let service: TaskAnalyticsService;
  let completionRepo: Repository<TaskCompletion>;

  const qbMock = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockCompletionRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => qbMock),
  };

  const mockTaskRepo = {
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskAnalyticsService,
        { provide: getRepositoryToken(TaskCompletion), useValue: mockCompletionRepo },
        { provide: getRepositoryToken(HealthTask), useValue: mockTaskRepo },
      ],
    }).compile();

    service = module.get<TaskAnalyticsService>(TaskAnalyticsService);
    completionRepo = module.get<Repository<TaskCompletion>>(getRepositoryToken(TaskCompletion));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateCompletionRate', () => {
    it('returns 0 when nothing attempted', () => {
      expect(service.calculateCompletionRate(0, 0)).toBe(0);
      expect(service.calculateCompletionRate(5, 0)).toBe(0);
    });

    it('computes correct percentage rounded to 2 decimals', () => {
      expect(service.calculateCompletionRate(1, 2)).toBe(50);
      expect(service.calculateCompletionRate(1, 3)).toBe(33.33);
      expect(service.calculateCompletionRate(2, 3)).toBe(66.67);
      expect(service.calculateCompletionRate(10, 10)).toBe(100);
    });
  });

  describe('resolveDateRange', () => {
    it('defaults to weekly (7 days back) when no period specified', () => {
      const { startDate, endDate } = service.resolveDateRange({});
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);
    });

    it('returns ~1 day window for daily', () => {
      const { startDate, endDate } = service.resolveDateRange({ period: 'daily' });
      const diffDays = Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(1);
    });

    it('returns ~7 days for weekly', () => {
      const { startDate, endDate } = service.resolveDateRange({ period: 'weekly' });
      const diffDays = Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(7);
    });

    it('returns ~30 days for monthly', () => {
      const { startDate, endDate } = service.resolveDateRange({ period: 'monthly' });
      const diffDays = Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(30);
    });

    it('honors explicit startDate and endDate', () => {
      const start = new Date('2025-01-01T00:00:00.000Z');
      const end = new Date('2025-01-15T00:00:00.000Z');
      const { startDate, endDate } = service.resolveDateRange({
        period: 'custom',
        startDate: start,
        endDate: end,
      });
      expect(startDate.toISOString()).toBe(start.toISOString());
      expect(endDate.toISOString()).toBe(end.toISOString());
    });
  });

  describe('getStats', () => {
    it('returns weekly stats with completion rate and category breakdown', async () => {
      mockCompletionRepo.count
        .mockResolvedValueOnce(10) // totalAttempted
        .mockResolvedValueOnce(7); // totalCompleted

      qbMock.getRawMany.mockResolvedValueOnce([
        {
          category: TaskCategory.NUTRITION,
          totalAttempted: '5',
          totalCompleted: '3',
        },
        {
          category: TaskCategory.FITNESS,
          totalAttempted: '5',
          totalCompleted: '4',
        },
      ]);

      const result = await service.getStats({ period: 'weekly' });

      expect(result.period).toBe('weekly');
      expect(result.totalAttempted).toBe(10);
      expect(result.totalCompleted).toBe(7);
      expect(result.completionRate).toBe(70);
      expect(result.categoryBreakdown).toHaveLength(2);

      const nutrition = result.categoryBreakdown.find(
        (c) => c.category === TaskCategory.NUTRITION,
      );
      expect(nutrition).toBeDefined();
      expect(nutrition!.totalAttempted).toBe(5);
      expect(nutrition!.totalCompleted).toBe(3);
      expect(nutrition!.completionRate).toBe(60);

      const fitness = result.categoryBreakdown.find(
        (c) => c.category === TaskCategory.FITNESS,
      );
      expect(fitness!.completionRate).toBe(80);
    });

    it('returns 0 completion rate when nothing attempted', async () => {
      mockCompletionRepo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      qbMock.getRawMany.mockResolvedValueOnce([]);

      const result = await service.getStats({ period: 'daily' });
      expect(result.totalAttempted).toBe(0);
      expect(result.totalCompleted).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.categoryBreakdown).toEqual([]);
      expect(result.period).toBe('daily');
    });

    it('applies userId filter when provided', async () => {
      mockCompletionRepo.count.mockResolvedValue(0);
      qbMock.getRawMany.mockResolvedValue([]);

      await service.getStats({ period: 'weekly', userId: 'user-123' });

      // The createQueryBuilder chain should have called andWhere for userId
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'completion.userId = :userId',
        { userId: 'user-123' },
      );
    });
  });

  describe('getWeeklyStats', () => {
    it('forces period weekly even if other period was passed', async () => {
      mockCompletionRepo.count.mockResolvedValue(0);
      qbMock.getRawMany.mockResolvedValue([]);

      const result = await service.getWeeklyStats();
      expect(result.period).toBe('weekly');
    });
  });

  describe('getDailyStats', () => {
    it('forces period daily', async () => {
      mockCompletionRepo.count.mockResolvedValue(0);
      qbMock.getRawMany.mockResolvedValue([]);

      const result = await service.getDailyStats();
      expect(result.period).toBe('daily');
    });
  });

  describe('getCategoryBreakdown', () => {
    it('handles uncategorized rows gracefully', async () => {
      qbMock.getRawMany.mockResolvedValueOnce([
        { category: null, totalAttempted: '4', totalCompleted: '2' },
      ]);

      const result = await service.getCategoryBreakdown(
        new Date('2025-01-01'),
        new Date('2025-01-08'),
      );

      expect(result).toEqual([
        {
          category: 'uncategorized',
          totalAttempted: 4,
          totalCompleted: 2,
          completionRate: 50,
        },
      ]);
    });
  });
});
