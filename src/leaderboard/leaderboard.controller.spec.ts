import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardPeriod } from './leaderboard-period.enum';
import { UserRankResponseDto } from './dto/leaderboard.dto';

describe('LeaderboardController', () => {
  let controller: LeaderboardController;

  const mockLeaderboardService = {
    getLeaderboard: jest.fn(),
    getUserRank: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaderboardController],
      providers: [
        {
          provide: LeaderboardService,
          useValue: mockLeaderboardService,
        },
      ],
    }).compile();

    controller = module.get<LeaderboardController>(LeaderboardController);
  });

  it('passes weekly period through to the leaderboard service', async () => {
    const expected = {
      topRankings: [],
      myRank: { rank: null, totalXlm: 0 },
      pagination: { page: 1, limit: 10, hasNextPage: false, hasPreviousPage: false },
    };
    mockLeaderboardService.getLeaderboard.mockResolvedValue(expected);

    const result = await controller.getRanking(
      { user: { id: 'user-1' } },
      10,
      1,
      'weekly',
    );

    expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(
      'user-1',
      10,
      undefined,
      1,
      LeaderboardPeriod.WEEKLY,
    );
    expect(result).toBe(expected);
  });

  it('defaults to all-time period when none is provided', async () => {
    const expected = {
      topRankings: [],
      myRank: { rank: null, totalXlm: 0 },
      pagination: { page: 1, limit: 5, hasNextPage: false, hasPreviousPage: false },
    };
    mockLeaderboardService.getLeaderboard.mockResolvedValue(expected);

    const result = await controller.getRanking(
      { user: { id: 'user-2' } },
      5,
      1,
      undefined,
    );

    expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(
      'user-2',
      5,
      undefined,
      1,
      LeaderboardPeriod.ALL_TIME,
    );
    expect(result).toBe(expected);
  });

  it('returns the global leaderboard alias without period param', async () => {
    const expected = {
      topRankings: [],
      myRank: { rank: null, totalXlm: 0 },
      pagination: { page: 1, limit: 25, hasNextPage: false, hasPreviousPage: false },
    };
    mockLeaderboardService.getLeaderboard.mockResolvedValue(expected);

    const result = await controller.getGlobal(
      { user: { id: 'user-3' } },
      25,
    );

    expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(
      'user-3',
      25,
      undefined,
      1,
    );
    expect(result).toBe(expected);
  });

  // ===========================================================================
  // GET /leaderboard/me/rank
  // ===========================================================================

  describe('getMyRank', () => {
    const mockUserRank: UserRankResponseDto = {
      userId: 'user-42',
      displayName: 'John D.',
      rank: 7,
      totalXlm: 350.75,
      country: 'NG',
      period: LeaderboardPeriod.ALL_TIME,
    };

    it('returns the user rank from the service', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue(mockUserRank);

      const result = await controller.getMyRank(
        { user: { id: 'user-42' } },
        undefined,
        undefined,
      );

      expect(mockLeaderboardService.getUserRank).toHaveBeenCalledWith(
        'user-42',
        undefined,
        LeaderboardPeriod.ALL_TIME,
      );
      expect(result).toBe(mockUserRank);
    });

    it('passes the period to the service when provided', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue({
        ...mockUserRank,
        period: LeaderboardPeriod.WEEKLY,
      });

      await controller.getMyRank(
        { user: { id: 'user-42' } },
        'weekly',
        undefined,
      );

      expect(mockLeaderboardService.getUserRank).toHaveBeenCalledWith(
        'user-42',
        undefined,
        LeaderboardPeriod.WEEKLY,
      );
    });

    it('passes the countryCode to the service when provided', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue({
        ...mockUserRank,
        country: 'NG',
      });

      await controller.getMyRank(
        { user: { id: 'user-42' } },
        undefined,
        'NG',
      );

      expect(mockLeaderboardService.getUserRank).toHaveBeenCalledWith(
        'user-42',
        'NG',
        LeaderboardPeriod.ALL_TIME,
      );
    });

    it('passes both period and countryCode when both are provided', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue({
        ...mockUserRank,
        period: LeaderboardPeriod.MONTHLY,
        country: 'KE',
      });

      await controller.getMyRank(
        { user: { id: 'user-42' } },
        'monthly',
        'KE',
      );

      expect(mockLeaderboardService.getUserRank).toHaveBeenCalledWith(
        'user-42',
        'KE',
        LeaderboardPeriod.MONTHLY,
      );
    });

    it('returns null rank when user is not on the leaderboard', async () => {
      const unranked: UserRankResponseDto = {
        userId: 'new-user',
        displayName: 'Anonymous',
        rank: null,
        totalXlm: 0,
        country: 'Global',
        period: LeaderboardPeriod.ALL_TIME,
      };
      mockLeaderboardService.getUserRank.mockResolvedValue(unranked);

      const result = await controller.getMyRank(
        { user: { id: 'new-user' } },
        undefined,
        undefined,
      );

      expect(result.rank).toBeNull();
      expect(result.totalXlm).toBe(0);
    });

    it('does not expose restricted user profile fields', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue(mockUserRank);

      const result = await controller.getMyRank(
        { user: { id: 'user-42' } },
        undefined,
        undefined,
      );

      // Verify only safe fields are present in the response
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result).not.toHaveProperty('twoFactorSecret');
      expect(result).not.toHaveProperty('emailVerificationToken');
      expect(result).not.toHaveProperty('passwordResetToken');
      expect(result).not.toHaveProperty('isActive');
      expect(result).not.toHaveProperty('failedLoginAttempts');

      // Verify the expected safe fields are present
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('displayName');
      expect(result).toHaveProperty('rank');
      expect(result).toHaveProperty('totalXlm');
      expect(result).toHaveProperty('country');
      expect(result).toHaveProperty('period');
    });

    it('uses daily period when daily is requested', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue({
        ...mockUserRank,
        period: LeaderboardPeriod.DAILY,
      });

      await controller.getMyRank(
        { user: { id: 'user-42' } },
        'daily',
        undefined,
      );

      expect(mockLeaderboardService.getUserRank).toHaveBeenCalledWith(
        'user-42',
        undefined,
        LeaderboardPeriod.DAILY,
      );
    });

    it('falls back to all-time for invalid period strings', async () => {
      mockLeaderboardService.getUserRank.mockResolvedValue(mockUserRank);

      await controller.getMyRank(
        { user: { id: 'user-42' } },
        'invalid-period',
        undefined,
      );

      expect(mockLeaderboardService.getUserRank).toHaveBeenCalledWith(
        'user-42',
        undefined,
        LeaderboardPeriod.ALL_TIME,
      );
    });
  });
});
