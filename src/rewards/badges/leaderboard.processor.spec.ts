import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardProcessor } from './leaderboard.processor';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardProcessor', () => {
  let processor: LeaderboardProcessor;
  let leaderboardService: LeaderboardService;

  const mockLeaderboardService = {
    rebuildLeaderboards: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardProcessor,
        {
          provide: LeaderboardService,
          useValue: mockLeaderboardService,
        },
      ],
    }).compile();

    processor = module.get<LeaderboardProcessor>(LeaderboardProcessor);
    leaderboardService = module.get<LeaderboardService>(LeaderboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleRebuild', () => {
    it('should call leaderboardService.rebuildLeaderboards on trigger', async () => {
      mockLeaderboardService.rebuildLeaderboards.mockResolvedValue(undefined);

      await processor.handleRebuild();

      expect(mockLeaderboardService.rebuildLeaderboards).toHaveBeenCalledTimes(1);
    });

    it('should log processing message', async () => {
      mockLeaderboardService.rebuildLeaderboards.mockResolvedValue(undefined);

      const logSpy = jest.spyOn(processor['logger'], 'log').mockImplementation();
      await processor.handleRebuild();

      expect(logSpy).toHaveBeenCalledWith(
        'Processing scheduled leaderboard rebuild...',
      );
      logSpy.mockRestore();
    });

    it('should handle errors from leaderboardService gracefully', async () => {
      const error = new Error('Database connection failed');
      mockLeaderboardService.rebuildLeaderboards.mockRejectedValue(error);

      const errorSpy = jest.spyOn(processor['logger'], 'error').mockImplementation();
      await processor.handleRebuild();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to rebuild leaderboard',
        error.stack,
      );
      errorSpy.mockRestore();
    });

    it('should not throw when leaderboardService fails', async () => {
      mockLeaderboardService.rebuildLeaderboards.mockRejectedValue(
        new Error('Timeout'),
      );

      // Should complete without throwing
      await expect(processor.handleRebuild()).resolves.not.toThrow();
    });
  });
});