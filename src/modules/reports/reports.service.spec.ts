import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { User } from '@/entities/user.entity';
import { TaskCompletion } from '@/tasks/entities/task-completion.entity';
import { RewardTransaction } from '@/rewards/entities/reward-transaction.entity';
import { Streak } from '@/streaks/entities/streak.entity';

describe('ReportsService', () => {
  let service: ReportsService;
  let userRepository: Repository<User>;
  let taskCompletionRepository: Repository<TaskCompletion>;
  let rewardTransactionRepository: Repository<RewardTransaction>;
  let streakRepository: Repository<Streak>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getCount: jest.fn(),
  };

  const mockRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(User),
          useValue: { ...mockRepository },
        },
        {
          provide: getRepositoryToken(TaskCompletion),
          useValue: { ...mockRepository },
        },
        {
          provide: getRepositoryToken(RewardTransaction),
          useValue: { ...mockRepository },
        },
        {
          provide: getRepositoryToken(Streak),
          useValue: { ...mockRepository },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    taskCompletionRepository = module.get<Repository<TaskCompletion>>(getRepositoryToken(TaskCompletion));
    rewardTransactionRepository = module.get<Repository<RewardTransaction>>(getRepositoryToken(RewardTransaction));
    streakRepository = module.get<Repository<Streak>>(getRepositoryToken(Streak));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHealthSummary', () => {
    it('should generate health summary statistics correctly', async () => {
      // Mock Task Completion query
      mockQueryBuilder.getRawOne.mockResolvedValueOnce({
        total: 10,
        verified: 6,
        pending: 3,
        rejected: 1,
      });

      // Mock Streak Groups query
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { currentStreak: 0, count: 5 },
        { currentStreak: 2, count: 3 },
        { currentStreak: 5, count: 2 },
        { currentStreak: 10, count: 1 },
        { currentStreak: 20, count: 1 },
      ]);

      // Mock Reward Transactions query
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { period: '2026-05-31T00:00:00.000Z', total: 150.50 },
        { period: '2026-05-30T00:00:00.000Z', total: 200.00 },
      ]);

      const result = await service.getHealthSummary('daily');

      expect(result).toBeDefined();
      expect(result.taskCompletionRates).toEqual({
        total: 10,
        verified: 6,
        pending: 3,
        rejected: 1,
        completionRate: 60,
      });
      expect(result.streakDistributions).toEqual({
        '0': 5,
        '1-3': 3,
        '4-7': 2,
        '8-14': 1,
        '15+': 1,
      });
      expect(result.rewardTotalsByPeriod).toEqual([
        { period: '2026-05-31', totalAmount: 150.5 },
        { period: '2026-05-30', totalAmount: 200 },
      ]);
    });

    it('should handle zero tasks/rewards gracefully', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValueOnce(null);
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      const result = await service.getHealthSummary('daily');

      expect(result.taskCompletionRates.completionRate).toBe(0);
      expect(result.rewardTotalsByPeriod).toEqual([]);
    });
  });

  describe('generateHealthSummaryCsv', () => {
    it('should format summary data as CSV correctly', () => {
      const mockSummary = {
        taskCompletionRates: {
          total: 100,
          verified: 80,
          pending: 15,
          rejected: 5,
          completionRate: 80.0,
        },
        streakDistributions: {
          '0': 10,
          '1-3': 20,
          '4-7': 30,
          '8-14': 25,
          '15+': 15,
        },
        rewardTotalsByPeriod: [
          { period: '2026-05-31', totalAmount: 500.0 },
          { period: '2026-05-30', totalAmount: 400.0 },
        ],
      };

      const csv = service.generateHealthSummaryCsv(mockSummary);

      expect(csv).toContain('Task Completion Rates');
      expect(csv).toContain('Total Tasks,100');
      expect(csv).toContain('Completion Rate (%),80');
      expect(csv).toContain('Streak Distributions');
      expect(csv).toContain('"1-3",20');
      expect(csv).toContain('Reward Totals by Period');
      expect(csv).toContain('2026-05-31,500');
    });
  });
});
