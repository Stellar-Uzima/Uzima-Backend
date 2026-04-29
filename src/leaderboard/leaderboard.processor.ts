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
    } catch (error) {
      this.logger.error('Failed to rebuild leaderboard', error.stack);
    }
  }
}
