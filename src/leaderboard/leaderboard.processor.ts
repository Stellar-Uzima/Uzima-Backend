import { Process, Processor, OnFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { LEADEROARD_QUEUE } from './leaderboard.constants';
import { LeaderboardService } from './leaderboard.service';
import { DeadLetterService } from '../shared/queue/dead-letter.service';
import { Logger } from '@nestjs/common';

@Processor(LEADEROARD_QUEUE)
export class LeaderboardProcessor {
  private readonly logger = new Logger(LeaderboardProcessor.name);

  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly deadLetterService: DeadLetterService,
  ) {}

  @Process('rebuild-leaderboard')
  async handleRebuild(job: Job) {
    this.logger.log(`Processing scheduled leaderboard rebuild (attempt ${job.attemptsMade + 1})...`);
    try {
      await this.leaderboardService.rebuildLeaderboards();
      // Invalidate cached leaderboard results so the next read reflects the
      // rebuild. Freshness window: results are refreshed on every scheduled
      // rebuild and served from cache until then.
      await this.leaderboardService.invalidateLeaderboardCache();
    } catch (error) {
      this.logger.error(
        `Failed to rebuild leaderboard (attempt ${job.attemptsMade + 1}): ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Rethrow so Bull applies the configured retry/backoff policy.
      throw error;
    }
  }

  @OnFailed()
  async onFailed(job: Job, error: Error) {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await this.deadLetterService.recordFailure({
        sourceQueue: LEADEROARD_QUEUE,
        jobId: job.id ?? null,
        jobName: job.name,
        attemptsMade: job.attemptsMade ?? maxAttempts,
        error,
        data: job.data,
      });
    }
  }
}
