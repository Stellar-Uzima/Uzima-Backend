import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  ClaimAttemptLog,
  AttemptType,
  AttemptOutcome,
} from './entities/claim-attempt-log.entity';
import { ReferralRecord } from '../../referral/entities/referral-record.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';

/**
 * Anti-abuse rules for referral and reward claims (#1373).
 *
 * ## Referral redemption rules
 *  - Self-referral is rejected.
 *  - A user may only redeem one referral code (already enforced by the
 *    referral service; re-asserted here).
 *  - Freshly created accounts cannot immediately redeem a referral
 *    (`ANTI_ABUSE_FRESH_ACCOUNT_MS`, default 10 minutes).
 *  - A single referrer cannot accumulate more than
 *    `ANTI_ABUSE_MAX_REFERRALS_PER_WINDOW` redemptions inside
 *    `ANTI_ABUSE_WINDOW_MS` (default 5 per hour) — stops burst farming via
 *    a code shared publicly.
 *
 * ## Reward claim rules
 *  - A user cannot exceed `ANTI_ABUSE_MAX_REWARD_CLAIMS_PER_WINDOW`
 *    (default 20) reward transactions inside the same sliding window —
 *    stops distribution floods while legitimate flows are unaffected.
 *
 * Every denied attempt is persisted to `claim_attempt_logs` with the reason
 * and surfaced through an operational log line, so the guard is auditable.
 */
@Injectable()
export class AntiAbuseService {
  private readonly logger = new Logger(AntiAbuseService.name);

  private readonly windowMs: number;
  private readonly maxReferralsPerWindow: number;
  private readonly maxRewardClaimsPerWindow: number;
  private readonly freshAccountMs: number;

  constructor(
    @InjectRepository(ClaimAttemptLog)
    private readonly attemptLogRepo: Repository<ClaimAttemptLog>,
    @InjectRepository(ReferralRecord)
    private readonly referralRepo: Repository<ReferralRecord>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.windowMs = Number(
      configService.get('ANTI_ABUSE_WINDOW_MS', 60 * 60 * 1000),
    );
    this.maxReferralsPerWindow = Number(
      configService.get('ANTI_ABUSE_MAX_REFERRALS_PER_WINDOW', 5),
    );
    this.maxRewardClaimsPerWindow = Number(
      configService.get('ANTI_ABUSE_MAX_REWARD_CLAIMS_PER_WINDOW', 20),
    );
    this.freshAccountMs = Number(
      configService.get('ANTI_ABUSE_FRESH_ACCOUNT_MS', 10 * 60 * 1000),
    );
  }

  /**
   * Validates a referral redemption. Throws `BadRequestException` with an
   * actionable message when a rule fires; records the outcome either way.
   */
  async assertReferralClaimAllowed(
    referrerId: string,
    referredId: string,
    context: { referralCode: string } = { referralCode: '' },
  ): Promise<void> {
    const metadata = { referrerId, ...context };

    if (referrerId === referredId) {
      await this.deny(AttemptType.REFERRAL_REDEMPTION, referredId, metadata, 'Self-referral attempt rejected');
      throw new BadRequestException('Self-referral attempt rejected');
    }

    const referredAlready = await this.referralRepo.findOne({
      where: { referred: { id: referredId } },
      select: ['id'],
    });
    if (referredAlready) {
      await this.deny(AttemptType.REFERRAL_REDEMPTION, referredId, metadata, 'User already redeemed a referral code');
      throw new BadRequestException('User has already redeemed a referral code');
    }

    const referredUser = await this.userRepo.findOne({
      where: { id: referredId },
      select: ['id', 'createdAt', 'status'],
    });
    if (
      referredUser &&
      Date.now() - referredUser.createdAt.getTime() < this.freshAccountMs
    ) {
      await this.deny(AttemptType.REFERRAL_REDEMPTION, referredId, metadata, 'Account too fresh to redeem a referral');
      throw new BadRequestException('Account too fresh to redeem a referral');
    }

    const windowStart = new Date(Date.now() - this.windowMs);
    const recentCount = await this.referralRepo.count({
      where: {
        referrer: { id: referrerId },
        createdAt: MoreThanOrEqual(windowStart),
      },
    });
    if (recentCount >= this.maxReferralsPerWindow) {
      await this.deny(
        AttemptType.REFERRAL_REDEMPTION,
        referredId,
        metadata,
        `Referrer exceeded ${this.maxReferralsPerWindow} redemptions in the window`,
      );
      throw new BadRequestException(
        `Referral code is temporarily rate-limited; please try again later`,
      );
    }

    await this.recordClaimAttempt(
      AttemptType.REFERRAL_REDEMPTION,
      referredId,
      AttemptOutcome.ALLOWED,
      metadata,
      null,
    );
  }

  /**
   * Validates a reward claim for a user against burst thresholds.
   */
  async assertRewardClaimAllowed(
    userId: string,
    amount?: number,
    claimId?: string,
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      amount: amount ?? null,
      claimId: claimId ?? null,
    };
    const windowStart = new Date(Date.now() - this.windowMs);
    const recentClaims = await this.rewardRepo.count({
      where: { userId, createdAt: MoreThanOrEqual(windowStart) },
    });

    if (recentClaims >= this.maxRewardClaimsPerWindow) {
      await this.deny(
        AttemptType.REWARD_CLAIM,
        userId,
        metadata,
        `User exceeded ${this.maxRewardClaimsPerWindow} claims in the window`,
      );
      throw new BadRequestException('Too many reward claims in a short period; try again later');
    }

    await this.recordClaimAttempt(
      AttemptType.REWARD_CLAIM,
      userId,
      AttemptOutcome.ALLOWED,
      metadata,
      null,
    );
  }

  /**
   * Explicitly records an attempt outcome (e.g. the referral service's
   * already-enforced rules) so the audit trail stays complete.
   */
  async recordClaimAttempt(
    attemptType: AttemptType,
    userId: string,
    outcome: AttemptOutcome,
    metadata: Record<string, unknown> | null,
    denialReason: string | null,
  ): Promise<ClaimAttemptLog> {
    const log = await this.attemptLogRepo.save(
      this.attemptLogRepo.create({
        attemptType,
        userId,
        outcome,
        metadata,
        denialReason,
      }),
    );
    if (outcome === AttemptOutcome.DENIED) {
      this.logger.warn(
        `Anti-abuse DENIED ${attemptType} userId=${userId}: ${denialReason ?? 'no reason'}`,
      );
    }
    return log;
  }

  /**
   * Support/review surface: recent attempt history for a user (or globally).
   */
  async getAttemptLogs(userId?: string, limit = 100): Promise<ClaimAttemptLog[]> {
    const qb = this.attemptLogRepo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .take(limit);
    if (userId) {
      qb.andWhere('log.userId = :userId', { userId });
    }
    return qb.getMany();
  }

  private async deny(
    attemptType: AttemptType,
    userId: string,
    metadata: Record<string, unknown>,
    reason: string,
  ): Promise<void> {
    await this.recordClaimAttempt(attemptType, userId, AttemptOutcome.DENIED, metadata, reason);
  }
}