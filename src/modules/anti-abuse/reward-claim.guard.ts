import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import {
  REWARD_QUEUE,
  REWARD_CLAIM_JOB,
} from '../../queue/queue.constants';
import { AntiAbuseService } from './anti-abuse.service';

export const STREAK_MILESTONE_EVENTS = [
  'streak_5',
  'streak_10',
  'streak_30',
  'streak_50',
  'streak_100',
] as const;

export type StreakMilestoneEvent = (typeof STREAK_MILESTONE_EVENTS)[number];

interface RewardClaimJobData {
  userId: string;
  amount: number;
  claimId?: string;
  /** Streak milestone that triggered this claim, if any. */
  milestoneEvent?: string;
  /** Unique identifier for the milestone occurrence (e.g. `${userId}:${event}:${streakCount}`). */
  milestoneKey?: string;
}

/**
 * Guards the existing `reward-claim` queue job before any distribution
 * happens. Legitimate claims pass straight through; abusive bursts are
 * rejected (and persisted to `claim_attempt_logs`), failing the job with a
 * clear reason for operators.
 *
 * Streak milestone claims are additionally validated: only configured
 * milestone events may award, and duplicate milestone processing is rejected
 * so the same milestone cannot issue a reward twice.
 */
@Processor(REWARD_QUEUE)
@Injectable()
export class RewardClaimGuard {
  private readonly logger = new Logger(RewardClaimGuard.name);

  /** In-memory dedupe set for milestone keys already processed. */
  private readonly processedMilestones = new Set<string>();

  constructor(private readonly antiAbuseService: AntiAbuseService) {}

  @Process({ name: REWARD_CLAIM_JOB, concurrency: 3 })
  async guardRewardClaim(job: Job<RewardClaimJobData>): Promise<{ allowed: true }> {
    const { userId, amount, claimId, milestoneEvent, milestoneKey } = job.data;

    if (milestoneEvent !== undefined) {
      this.assertMilestoneEligible(milestoneEvent, milestoneKey, userId);
    }

    await this.antiAbuseService.assertRewardClaimAllowed(userId, amount, claimId);

    if (milestoneKey !== undefined) {
      this.processedMilestones.add(milestoneKey);
    }

    this.logger.log(
      `Reward claim allowed: userId=${userId} amount=${amount} claim=${claimId ?? 'n/a'} milestone=${milestoneEvent ?? 'n/a'}`,
    );
    return { allowed: true };
  }

  private assertMilestoneEligible(
    milestoneEvent: string,
    milestoneKey: string | undefined,
    userId: string,
  ): void {
    if (!STREAK_MILESTONE_EVENTS.includes(milestoneEvent as StreakMilestoneEvent)) {
      this.logger.warn(
        `Rejected unconfigured milestone event: userId=${userId} event=${milestoneEvent}`,
      );
      throw new Error(
        `Milestone event '${milestoneEvent}' is not configured for reward issuance`,
      );
    }

    if (milestoneKey === undefined || milestoneKey.length === 0) {
      this.logger.warn(
        `Rejected milestone claim without a dedupe key: userId=${userId} event=${milestoneEvent}`,
      );
      throw new Error(
        `Milestone claim for '${milestoneEvent}' is missing a milestoneKey`,
      );
    }

    if (this.processedMilestones.has(milestoneKey)) {
      this.logger.warn(
        `Rejected duplicate milestone processing: userId=${userId} key=${milestoneKey}`,
      );
      throw new Error(
        `Milestone '${milestoneEvent}' already issued a reward for key '${milestoneKey}'`,
      );
    }
  }
}
