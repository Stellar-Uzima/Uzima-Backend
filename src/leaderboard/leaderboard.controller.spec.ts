import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardPeriod } from './leaderboard-period.enum';

describe('LeaderboardController', () => {
  let controller: LeaderboardController;

  const mockLeaderboardService = {
    getLeaderboard: jest.fn(),
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
    };
    mockLeaderboardService.getLeaderboard.mockResolvedValue(expected);

    const result = await controller.getGlobal(
      { user: { id: 'user-3' } },
      25,
    );

    expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(
      'user-3',
      25,
    );
    expect(result).toBe(expected);
  });
});
