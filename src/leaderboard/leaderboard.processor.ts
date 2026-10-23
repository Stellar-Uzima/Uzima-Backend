import { Process, Processor } from '@nestjs/bull';
import { LEADERBOARD_QUEUE } from './leaderboard.constants';
import { LeaderboardService } from './leaderboard.service';
import { Logger } from '@nestjs/common';

@Processor(LEADERBOARD_QUEUE)
export class LeaderboardProcessor {
  private readonly logger = new Logger(LeaderboardProcessor.name);

  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Process('rebuild-leaderboard')
  async handleRebuild() {
    this.logger.log('Processing scheduled leaderboard rebuild...');
    try {
      await this.leaderboardService.rebuildLeaderboards();
      // Invalidate cached leaderboard results so the next read reflects the
      // rebuild. Freshness window: results are refreshed on every scheduled
      // rebuild and served from cache until then.
      await this.leaderboardService.invalidateLeaderboardCache();
    } catch (error) {
      this.logger.error('Failed to rebuild leaderboard', error.stack);
    }
  }
}
