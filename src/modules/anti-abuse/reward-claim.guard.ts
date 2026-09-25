import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import {
  REWARD_QUEUE,
  REWARD_CLAIM_JOB,
} from '../../queue/queue.constants';
import { AntiAbuseService } from './anti-abuse.service';

interface RewardClaimJobData {
  userId: string;
  amount: number;
  claimId?: string;
}

/**
 * Guards the existing `reward-claim` queue job before any distribution
 * happens. Legitimate claims pass straight through; abusive bursts are
 * rejected (and persisted to `claim_attempt_logs`), failing the job with a
 * clear reason for operators.
 */
@Processor(REWARD_QUEUE)
@Injectable()
export class RewardClaimGuard {
  private readonly logger = new Logger(RewardClaimGuard.name);

  constructor(private readonly antiAbuseService: AntiAbuseService) {}

  @Process({ name: REWARD_CLAIM_JOB, concurrency: 3 })
  async guardRewardClaim(job: Job<RewardClaimJobData>): Promise<{ allowed: true }> {
    const { userId, amount, claimId } = job.data;
    await this.antiAbuseService.assertRewardClaimAllowed(userId, amount, claimId);
    this.logger.log(
      `Reward claim allowed: userId=${userId} amount=${amount} claim=${claimId ?? 'n/a'}`,
    );
    return { allowed: true };
  }
}