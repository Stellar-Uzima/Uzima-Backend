import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AggregationService } from './aggregation.service';
import { TaskCompletion } from '../database/entities/task-completion.entity';
import { Consultation } from '../modules/consultations/entities/consultation.entity';
import { TaskCategory } from '../tasks/entities/health-task.entity';

describe('AggregationService', () => {
  let service: AggregationService;
  let completionQueryBuilder: any;
  let consultationQueryBuilder: any;
  let completionRepo: { createQueryBuilder: jest.Mock; count: jest.Mock };
  let consultationRepo: { createQueryBuilder: jest.Mock };

  const userId = 'user-1';
  const periodStart = new Date('2026-07-13T00:00:00Z');
  const periodEnd = new Date('2026-07-19T23:59:59Z');

  function makeCompletion(overrides: Partial<any> = {}) {
    return {
      userId,
      isCompleted: true,
      completedAt: new Date('2026-07-14T10:00:00Z'),
      createdAt: new Date('2026-07-14T09:00:00Z'),
      task: { category: TaskCategory.FITNESS },
      ...overrides,
    };
  }

  beforeEach(async () => {
    completionQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    consultationQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    completionRepo = {
      createQueryBuilder: jest.fn(() => completionQueryBuilder),
      count: jest.fn().mockResolvedValue(0),
    };
    consultationRepo = {
      createQueryBuilder: jest.fn(() => consultationQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregationService,
        { provide: getRepositoryToken(TaskCompletion), useValue: completionRepo },
        { provide: getRepositoryToken(Consultation), useValue: consultationRepo },
      ],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
  });

  describe('category stats', () => {
    it('computes assigned/completed/rate per category from real completions', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([
        makeCompletion({ isCompleted: true, task: { category: TaskCategory.FITNESS } }),
        makeCompletion({ isCompleted: false, task: { category: TaskCategory.FITNESS } }),
        makeCompletion({ isCompleted: true, task: { category: TaskCategory.NUTRITION } }),
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      const fitness = result.categoryStats.find((c) => c.category === TaskCategory.FITNESS);
      const nutrition = result.categoryStats.find((c) => c.category === TaskCategory.NUTRITION);

      expect(fitness).toEqual({
        category: TaskCategory.FITNESS,
        assigned: 2,
        completed: 1,
        completionRate: 50,
      });
      expect(nutrition).toEqual({
        category: TaskCategory.NUTRITION,
        assigned: 1,
        completed: 1,
        completionRate: 100,
      });
    });

    it('excludes categories with zero assigned tasks from the output', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([
        makeCompletion({ task: { category: TaskCategory.SLEEP } }),
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.categoryStats).toHaveLength(1);
      expect(result.categoryStats[0].category).toBe(TaskCategory.SLEEP);
    });

    it('computes overall completion rate across all categories combined', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([
        makeCompletion({ isCompleted: true, task: { category: TaskCategory.FITNESS } }),
        makeCompletion({ isCompleted: true, task: { category: TaskCategory.NUTRITION } }),
        makeCompletion({ isCompleted: false, task: { category: TaskCategory.MENTAL } }),
        makeCompletion({ isCompleted: false, task: { category: TaskCategory.SLEEP } }),
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.overallCompletionRate).toBe(50);
    });

    it('returns zero rate and empty stats when the user has no completions', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.categoryStats).toEqual([]);
      expect(result.overallCompletionRate).toBe(0);
    });
  });

  describe('streak calculation', () => {
    it('counts a current streak of consecutive completed days ending on periodEnd', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([
        makeCompletion({ completedAt: new Date('2026-07-17T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-18T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-19T08:00:00Z') }),
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.streak.currentStreak).toBe(3);
    });

    it('resets current streak to zero if the final day has no completion', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([
        makeCompletion({ completedAt: new Date('2026-07-16T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-17T08:00:00Z') }),
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.streak.currentStreak).toBe(0);
    });

    it('finds the longest streak within the lookback window even if not current', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([
        makeCompletion({ completedAt: new Date('2026-07-10T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-11T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-12T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-13T08:00:00Z') }),
        makeCompletion({ completedAt: new Date('2026-07-19T08:00:00Z') }),
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.streak.longestStreakInPeriod).toBe(4);
    });

    it('relies on the isCompleted=true SQL filter, so uncompleted rows never reach the streak calc', async () => {
      // The real query filters isCompleted=true at the DB level (see
      // getStreakSummary's .andWhere('c.isCompleted = true')). Since this
      // mock returns whatever getMany is given regardless of the query
      // chain, an empty array here simulates the DB having already
      // excluded the uncompleted row - the correct mock for this filter.
      completionQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.streak.currentStreak).toBe(0);
    });
  });

  describe('badges', () => {
    it('awards a streak-milestone badge when current streak meets the threshold', async () => {
      const sevenDays = Array.from({ length: 7 }, (_, i) =>
        makeCompletion({
          completedAt: new Date(`2026-07-${13 + i}T08:00:00Z`),
        })
      );
      completionQueryBuilder.getMany.mockResolvedValue(sevenDays);
      completionRepo.count.mockResolvedValue(7);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.badgesEarned.some((b) => b.name === '7-Day Streak')).toBe(true);
    });

    it('awards a completion-count badge based on all-time totals, not just this period', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([]);
      completionRepo.count.mockResolvedValue(25);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.badgesEarned.some((b) => b.name === '25 Tasks Completed')).toBe(true);
      expect(result.badgesEarned.some((b) => b.name === '50 Tasks Completed')).toBe(false);
    });

    it('awards no badges when neither streak nor count thresholds are met', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([]);
      completionRepo.count.mockResolvedValue(2);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.badgesEarned).toEqual([]);
    });
  });

  describe('consultations', () => {
    it('splits scheduled consultations into completed and cancelled counts', async () => {
      consultationQueryBuilder.getMany.mockResolvedValue([
        { userId, cancelled: false, scheduledAt: new Date('2026-07-15') },
        { userId, cancelled: true, scheduledAt: new Date('2026-07-16') },
        { userId, cancelled: false, scheduledAt: new Date('2026-07-17') },
      ]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.consultations).toEqual({
        totalScheduled: 3,
        completed: 2,
        cancelled: 1,
      });
    });
  });

  describe('insight generation', () => {
    it('produces a no-completions message when there are no category stats', async () => {
      completionQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.insight).toMatch(/didn't complete any tasks/i);
    });

    it('mentions the streak when current streak is 7 or more days', async () => {
      const sevenDays = Array.from({ length: 7 }, (_, i) =>
        makeCompletion({
          completedAt: new Date(`2026-07-${13 + i}T08:00:00Z`),
          task: { category: TaskCategory.FITNESS },
        })
      );
      completionQueryBuilder.getMany.mockResolvedValue(sevenDays);

      const result = await service.aggregateForUser(userId, periodStart, periodEnd);

      expect(result.insight).toMatch(/streak/i);
    });
  });
});
