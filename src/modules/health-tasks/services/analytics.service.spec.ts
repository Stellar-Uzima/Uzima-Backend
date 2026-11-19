import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';
import {
  TaskCompletion,
  TaskCompletionStatus,
} from '../../../tasks/entities/task-completion.entity';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { DailyTaskAssignment } from '../../../tasks/entities/daily-task-assignment.entity';

const mockQueryBuilder: any = {};

const mockCompletionRepo = {
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
};

const mockTaskRepo = {
  count: jest.fn(),
};

const mockAssignmentRepo = {};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.assign(mockQueryBuilder, {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });
    mockCache.get.mockResolvedValue(undefined);
    mockCache.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(TaskCompletion), useValue: mockCompletionRepo },
        { provide: getRepositoryToken(HealthTask), useValue: mockTaskRepo },
        {
          provide: getRepositoryToken(DailyTaskAssignment),
          useValue: mockAssignmentRepo,
        },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserTaskStats', () => {
    it('computes the completion rate from verified and pending completions', async () => {
      mockCompletionRepo.count
        .mockResolvedValueOnce(7) // verified
        .mockResolvedValueOnce(3); // pending

      const stats = await service.getUserTaskStats('user-1');

      expect(stats).toEqual({
        totalCompletions: 7,
        pendingCompletions: 3,
        completionRate: 70,
      });
      expect(mockCache.set).toHaveBeenCalledWith('user_stats_user-1', stats, 300000);
    });

    it('returns cached stats without querying the repositories', async () => {
      const cached = {
        totalCompletions: 1,
        pendingCompletions: 0,
        completionRate: 100,
      };
      mockCache.get.mockResolvedValueOnce(cached);

      await expect(service.getUserTaskStats('user-1')).resolves.toBe(cached);
      expect(mockCompletionRepo.count).not.toHaveBeenCalled();
    });

    it('returns a zero rate when the user has no completions', async () => {
      mockCompletionRepo.count.mockResolvedValue(0);

      const stats = await service.getUserTaskStats('user-1');

      expect(stats.totalCompletions).toBe(0);
      expect(stats.completionRate).toBe(0);
    });
  });

  describe('getGlobalStats', () => {
    it('counts tasks and verified completions', async () => {
      mockTaskRepo.count.mockResolvedValue(12);
      mockCompletionRepo.count.mockResolvedValue(5);
      mockQueryBuilder.getRawMany.mockResolvedValue([{ category: 'nutrition', count: '5' }]);

      const stats = await service.getGlobalStats();

      expect(stats.totalTasks).toBe(12);
      expect(stats.totalVerifiedCompletions).toBe(5);
      expect(stats.categoryBreakdown).toEqual([{ category: 'nutrition', count: '5' }]);
      expect(mockCompletionRepo.count).toHaveBeenCalledWith({
        where: { status: TaskCompletionStatus.VERIFIED },
      });
    });
  });

  describe('getTrends', () => {
    it('filters the trend query to the requested window and verified completions', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([{ count: '2' }]);

      const trends = await service.getTrends(14);

      expect(trends).toEqual([{ count: '2' }]);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('completion.completedAt >= :startDate', {
        startDate: expect.any(Date),
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('completion.status = :status', {
        status: TaskCompletionStatus.VERIFIED,
      });
      expect(mockCache.set).toHaveBeenCalledWith('task_trends_14', [{ count: '2' }], 3600000);
    });
  });
});
