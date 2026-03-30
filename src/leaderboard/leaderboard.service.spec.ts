import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { LeaderboardService } from './leaderboard.service';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';

const mockRedisClient = {
  zrevrange: jest.fn(),
  hmget: jest.fn(),
  zrevrank: jest.fn(),
  zscore: jest.fn(),
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

  describe('getLeaderboard', () => {
    const userId = 'user-uuid-1';

    it('should return global leaderboard with user ranking', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-1', '1000',
        'user-2', '800',
        'user-3', '600',
      ]);
      mockRedisClient.hmget.mockResolvedValue(['Alice A.', 'Bob B.', 'Carol C.']);
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('1000');

      const result = await service.getLeaderboard(userId, 3);

      expect(result.topRankings).toHaveLength(3);
      expect(result.topRankings[0]).toEqual({
        rank: 1,
        userId: 'user-1',
        displayName: 'Alice A.',
        totalXlm: 1000,
        country: 'Global',
      });
      expect(result.myRank).toEqual({ rank: 1, totalXlm: 1000 });
    });

    it('should return country-specific leaderboard when countryCode provided', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['user-2', '500', 'user-3', '300']);
      mockRedisClient.hmget.mockResolvedValue(['Bob B.', 'Carol C.']);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const result = await service.getLeaderboard(userId, 10, 'US');

      expect(result.topRankings[0].country).toBe('US');
      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith(
        'leaderboard:country:US',
        0,
        9,
        'WITHSCORES',
      );
    });

    it('should use Anonymous for missing display names', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['user-1', '500']);
      mockRedisClient.hmget.mockResolvedValue([null]);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue('0');

      const result = await service.getLeaderboard(userId, 1);

      expect(result.topRankings[0].displayName).toBe('Anonymous');
    });

    it('should return null rank when user not on leaderboard', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([]);
      mockRedisClient.hmget.mockResolvedValue([]);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const result = await service.getLeaderboard(userId, 50);

      expect(result.topRankings).toHaveLength(0);
      expect(result.myRank).toEqual({ rank: null, totalXlm: 0 });
    });

    it('should parse score strings to floats correctly', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['user-1', '1234.56']);
      mockRedisClient.hmget.mockResolvedValue(['Test User']);
      mockRedisClient.zrevrank.mockResolvedValue(5);
      mockRedisClient.zscore.mockResolvedValue('1234.56');

      const result = await service.getLeaderboard(userId, 1);

      expect(result.topRankings[0].totalXlm).toBe(1234.56);
      expect(result.myRank.totalXlm).toBe(1234.56);
    });

    it('should uppercase countryCode for Redis key', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([]);
      mockRedisClient.hmget.mockResolvedValue([]);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      await service.getLeaderboard(userId, 10, 'us');

      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith(
        'leaderboard:country:US',
        0,
        9,
        'WITHSCORES',
      );
    });
  });

  describe('rebuildLeaderboards', () => {
    it('should query successful transactions since start of month', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockRewardRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.rebuildLeaderboards();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'rt.status = :status',
        { status: 'SUCCESS' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
      expect(mockQueryBuilder.getRawMany).toHaveBeenCalled();
    });

    it('should clear global leaderboard before rebuilding', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockRewardRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.rebuildLeaderboards();

      expect(mockPipeline.del).toHaveBeenCalledWith('leaderboard:global');
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should add users to global and country leaderboards', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { userId: 'user-1', totalXlm: '500', fullName: 'Alice Adams', country: 'US' },
          { userId: 'user-2', totalXlm: '300', fullName: 'Bob Brown', country: 'GB' },
        ]),
      };
      mockRewardRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.rebuildLeaderboards();

      expect(mockPipeline.zadd).toHaveBeenCalledWith('leaderboard:global', 500, 'user-1');
      expect(mockPipeline.zadd).toHaveBeenCalledWith('leaderboard:country:US', 500, 'user-1');
      expect(mockPipeline.zadd).toHaveBeenCalledWith('leaderboard:country:GB', 300, 'user-2');
    });

    it('should update name metadata hash', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { userId: 'user-1', totalXlm: '100', fullName: 'Test User', country: 'US' },
        ]),
      };
      mockRewardRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.rebuildLeaderboards();

      expect(mockPipeline.hmset).toHaveBeenCalledWith(
        'leaderboard:metadata:names',
        { 'user-1': 'Test U.' },
      );
    });

    it('should not update metadata hash when no users', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockRewardRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.rebuildLeaderboards();

      expect(mockPipeline.hmset).not.toHaveBeenCalled();
    });

    it('should log completion with user count', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { userId: 'user-1', totalXlm: '100', fullName: 'A B', country: 'US' },
        ]),
      };
      mockRewardRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.rebuildLeaderboards();

      expect(logSpy).toHaveBeenCalledWith(
        'Leaderboard rebuild complete. Processed 1 users.',
      );
    });
  });
});
