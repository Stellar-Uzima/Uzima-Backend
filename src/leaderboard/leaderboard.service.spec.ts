import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  LeaderboardCalculationRow,
  LeaderboardService,
} from './leaderboard.service';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';
import {
  LeaderboardPeriod,
  buildLeaderboardSetKey,
} from './leaderboard-period.enum';

const mockRedisClient = {
  zrevrange: jest.fn(),
  hmget: jest.fn(),
  zrevrank: jest.fn(),
  zscore: jest.fn(),
  scan: jest.fn(),
  pipeline: jest.fn(),
  del: jest.fn(),
  zadd: jest.fn(),
  hmset: jest.fn(),
  exec: jest.fn(),
};

const mockPipeline = {
  del: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  hmset: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

mockRedisClient.pipeline.mockReturnValue(mockPipeline);

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let fixtureRows: LeaderboardCalculationRow[];

  const mockRewardRepo = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        {
          provide: getRepositoryToken(RewardTransaction),
          useValue: mockRewardRepo,
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            stores: { client: mockRedisClient },
          },
        },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);

    fixtureRows = [
      {
        userId: 'user-01',
        totalXlm: 250,
        displayName: 'User 01',
        country: 'NG',
        category: 'nutrition',
        firstTaskCompletedAt: new Date('2026-03-01T00:01:00Z'),
      },
      {
        userId: 'user-02',
        totalXlm: 220,
        displayName: 'User 02',
        country: 'KE',
        category: 'fitness',
        firstTaskCompletedAt: new Date('2026-03-01T00:02:00Z'),
      },
      {
        userId: 'user-03',
        totalXlm: 220,
        displayName: 'User 03',
        country: 'NG',
        category: 'nutrition',
        firstTaskCompletedAt: new Date('2026-03-01T00:01:30Z'),
      },
      {
        userId: 'user-04',
        totalXlm: 210,
        displayName: 'User 04',
        country: 'GH',
        category: 'mental',
        firstTaskCompletedAt: new Date('2026-03-01T00:03:00Z'),
      },
      {
        userId: 'user-05',
        totalXlm: 205,
        displayName: 'User 05',
        country: 'NG',
        category: 'sleep',
        firstTaskCompletedAt: new Date('2026-03-01T00:04:00Z'),
      },
      {
        userId: 'user-06',
        totalXlm: 190,
        displayName: 'User 06',
        country: 'UG',
        category: 'fitness',
        firstTaskCompletedAt: new Date('2026-03-01T00:05:00Z'),
      },
      {
        userId: 'user-07',
        totalXlm: 180,
        displayName: 'User 07',
        country: 'NG',
        category: 'nutrition',
        firstTaskCompletedAt: new Date('2026-03-01T00:06:00Z'),
      },
      {
        userId: 'user-08',
        totalXlm: 170,
        displayName: 'User 08',
        country: 'KE',
        category: 'fitness',
        firstTaskCompletedAt: new Date('2026-03-01T00:07:00Z'),
      },
      {
        userId: 'user-09',
        totalXlm: 160,
        displayName: 'User 09',
        country: 'GH',
        category: 'mental',
        firstTaskCompletedAt: new Date('2026-03-01T00:08:00Z'),
      },
      {
        userId: 'user-10',
        totalXlm: 150,
        displayName: 'User 10',
        country: 'NG',
        category: 'nutrition',
        firstTaskCompletedAt: new Date('2026-03-01T00:09:00Z'),
      },
      {
        userId: 'user-11',
        totalXlm: 145,
        displayName: 'User 11',
        country: 'UG',
        category: 'hydration',
        firstTaskCompletedAt: new Date('2026-03-01T00:10:00Z'),
      },
      {
        userId: 'user-12',
        totalXlm: 140,
        displayName: 'User 12',
        country: 'NG',
        category: 'sleep',
        firstTaskCompletedAt: new Date('2026-03-01T00:11:00Z'),
      },
      {
        userId: 'user-13',
        totalXlm: 130,
        displayName: 'User 13',
        country: 'KE',
        category: 'fitness',
        firstTaskCompletedAt: new Date('2026-03-01T00:12:00Z'),
      },
      {
        userId: 'user-14',
        totalXlm: 120,
        displayName: 'User 14',
        country: 'GH',
        category: 'mental',
        firstTaskCompletedAt: new Date('2026-03-01T00:13:00Z'),
      },
      {
        userId: 'user-15',
        totalXlm: 110,
        displayName: 'User 15',
        country: 'NG',
        category: 'nutrition',
        firstTaskCompletedAt: new Date('2026-03-01T00:14:00Z'),
      },
      {
        userId: 'user-16',
        totalXlm: 100,
        displayName: 'User 16',
        country: 'KE',
        category: 'hydration',
        firstTaskCompletedAt: new Date('2026-03-01T00:15:00Z'),
      },
      {
        userId: 'user-17',
        totalXlm: 95,
        displayName: 'User 17',
        country: 'UG',
        category: 'sleep',
        firstTaskCompletedAt: new Date('2026-03-01T00:16:00Z'),
      },
      {
        userId: 'user-18',
        totalXlm: 90,
        displayName: 'User 18',
        country: 'NG',
        category: 'nutrition',
        firstTaskCompletedAt: new Date('2026-03-01T00:17:00Z'),
      },
      {
        userId: 'user-19',
        totalXlm: 85,
        displayName: 'User 19',
        country: 'KE',
        category: 'fitness',
        firstTaskCompletedAt: new Date('2026-03-01T00:18:00Z'),
      },
      {
        userId: 'user-20',
        totalXlm: 80,
        displayName: 'User 20',
        country: 'GH',
        category: 'mental',
        firstTaskCompletedAt: new Date('2026-03-01T00:19:00Z'),
      },
      {
        userId: 'user-21',
        totalXlm: 75,
        displayName: 'User 21',
        country: 'UG',
        category: 'hydration',
        firstTaskCompletedAt: new Date('2026-03-01T00:20:00Z'),
      },
      {
        userId: 'user-22',
        totalXlm: 70,
        displayName: 'User 22',
        country: 'NG',
        category: 'sleep',
        firstTaskCompletedAt: new Date('2026-03-01T00:21:00Z'),
      },
    ];
  });

  describe('formatDisplayName', () => {
    it('should return full name as-is if only one word', () => {
      const result = service['formatDisplayName']('John');
      expect(result).toBe('John');
    });

    it('should return first name and last initial for two-word names', () => {
      const result = service['formatDisplayName']('John Doe');
      expect(result).toBe('John D.');
    });

    it('should return first name and last initial for multi-word names', () => {
      const result = service['formatDisplayName']('John Robert Doe');
      expect(result).toBe('John D.');
    });

    it('should trim whitespace', () => {
      const result = service['formatDisplayName']('  John   Doe  ');
      expect(result).toBe('John D.');
    });
  });

  describe('calculation helpers', () => {
    it('ranks the global leaderboard in descending order by points', () => {
      const result = service.buildLeaderboardResponse(fixtureRows, 'user-10', {
        page: 1,
        limit: 6,
      });

      expect(result.topRankings.map((entry) => entry.userId)).toEqual([
        'user-01',
        'user-03',
        'user-02',
        'user-04',
        'user-05',
        'user-06',
      ]);
      expect(result.topRankings.map((entry) => entry.rank)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
      expect(result.myRank).toEqual({
        rank: 10,
        totalXlm: 150,
      });
    });

    it('only includes users with activity in the requested category leaderboard', () => {
      const result = service.buildLeaderboardResponse(fixtureRows, 'user-15', {
        category: 'nutrition',
        page: 1,
        limit: 10,
      });

      expect(result.topRankings.map((entry) => entry.userId)).toEqual([
        'user-01',
        'user-03',
        'user-07',
        'user-10',
        'user-15',
        'user-18',
      ]);
      expect(
        result.topRankings.every((entry) =>
          ['user-01', 'user-03', 'user-07', 'user-10', 'user-15', 'user-18'].includes(
            entry.userId,
          ),
        ),
      ).toBe(true);
      expect(result.myRank).toEqual({
        rank: 5,
        totalXlm: 110,
      });
    });

    it('breaks ties by earliest task completion timestamp', () => {
      const rankedRows = service.rankLeaderboardRows([
        {
          userId: 'tie-user-3',
          totalXlm: 100,
          displayName: 'Tie User 3',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-05T09:00:00Z'),
        },
        {
          userId: 'tie-user-1',
          totalXlm: 100,
          displayName: 'Tie User 1',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-05T07:00:00Z'),
        },
        {
          userId: 'tie-user-2',
          totalXlm: 100,
          displayName: 'Tie User 2',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-05T08:00:00Z'),
        },
      ]);

      expect(rankedRows.map((row) => row.userId)).toEqual([
        'tie-user-1',
        'tie-user-2',
        'tie-user-3',
      ]);
    });

    it('assigns deterministic ranks with shared ranks for ties', () => {
      const rankedRows = service.rankLeaderboardRows([
        {
          userId: 'tie-user-b',
          totalXlm: 100,
          displayName: 'Tie User B',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-05T08:00:00Z'),
        },
        {
          userId: 'tie-user-a',
          totalXlm: 100,
          displayName: 'Tie User A',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-05T08:00:00Z'),
        },
        {
          userId: 'solo-user',
          totalXlm: 90,
          displayName: 'Solo User',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-05T09:00:00Z'),
        },
      ]);

      expect(rankedRows.map((row) => row.userId)).toEqual([
        'tie-user-a',
        'tie-user-b',
        'solo-user',
      ]);
      expect(rankedRows.map((row) => row.rank)).toEqual([1, 1, 3]);
    });

    it('returns the correct pagination slice for first, last, and out-of-range pages', () => {
      const firstPage = service.buildLeaderboardResponse(
        fixtureRows,
        'user-01',
        {
          page: 1,
          limit: 5,
        },
      );
      const lastPage = service.buildLeaderboardResponse(fixtureRows, 'user-01', {
        page: 5,
        limit: 5,
      });
      const beyondResults = service.buildLeaderboardResponse(
        fixtureRows,
        'user-01',
        {
          page: 6,
          limit: 5,
        },
      );

      expect(firstPage.topRankings.map((entry) => entry.userId)).toEqual([
        'user-01',
        'user-03',
        'user-02',
        'user-04',
        'user-05',
      ]);
      expect(lastPage.topRankings.map((entry) => entry.userId)).toEqual([
        'user-21',
        'user-22',
      ]);
      expect(lastPage.topRankings.map((entry) => entry.rank)).toEqual([21, 22]);
      expect(beyondResults.topRankings).toEqual([]);
    });

    it('excludes ineligible users from rankings and myRank', () => {
      const rows: LeaderboardCalculationRow[] = [
        ...fixtureRows,
        {
          userId: 'excluded-user',
          totalXlm: 999,
          displayName: 'Excluded User',
          country: 'NG',
          category: 'nutrition',
          firstTaskCompletedAt: new Date('2026-03-01T00:00:00Z'),
          eligible: false,
        },
      ];

      const result = service.buildLeaderboardResponse(rows, 'excluded-user', {
        page: 1,
        limit: 5,
      });

      expect(result.topRankings.map((entry) => entry.userId)).toEqual([
        'user-01',
        'user-03',
        'user-02',
        'user-04',
        'user-05',
      ]);
      expect(result.myRank).toBeNull();
    });
  });
});
