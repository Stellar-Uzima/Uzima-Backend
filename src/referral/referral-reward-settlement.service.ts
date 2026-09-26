import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { runAtomicMoneyMovement } from '../common/utils/atomic-money-movement.util';
import { User } from '../entities/user.entity';
import { AntiAbuseService } from '../modules/anti-abuse/anti-abuse.service';
import { UserStatus } from '../modules/auth/enums/user-status.enum';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../rewards/enums/reward-status.enum';
import { Currency } from '../shared/currency/currency.enum';
import { ReferralRecord } from './entities/referral-record.entity';
import { ReferralRewardSettlement } from './entities/referral-reward-settlement.entity';
import {
  DEFAULT_REFERRAL_REWARD_CURRENCY,
  DEFAULT_REFERRAL_REWARD_XLM,
  REFERRAL_REWARD_AMOUNT_ENV,
  ReferralQualifyingAction,
  ReferralSettlementReason,
  isReferralQualifyingAction,
} from './referral-reward.constants';

export interface SettleReferralRewardParams {
  /** The user who redeemed the referral code and completed the action. */
  referredUserId: string;
  /** The qualifying action being claimed for the referral. */
  qualifyingAction: string;
  /** Optional amount override; defaults to `REFERRAL_REWARD_XLM` (5 XLM). */
  amount?: number;
  /** Optional currency override; defaults to XLM. */
  currency?: Currency;
  /** Correlates the settlement with its source event, e.g. a completion id. */
  referenceId?: string;
}

export interface ReferralSettlementResult {
  settled: boolean;
  reason: ReferralSettlementReason;
  /** True when a previous settlement already covered this referral. */
  idempotent?: boolean;
  settlementId?: string;
  rewardTransactionId?: string;
  referrerId?: string;
  amount?: number;
  currency?: Currency;
  settledAt?: Date;
}

/**
 * Settles referral rewards.
 *
 * A referral becomes payable only when the referred user performs an action
 * from the {@link ReferralQualifyingAction} allow-list. When it does, one
 * `reward_transactions` credit is created for the referrer and the event is
 * recorded in `referral_reward_settlements` with a unique id and timestamp.
 *
 * The service is idempotent end to end:
 *  - the referral row is loaded `FOR UPDATE` inside a serializable transaction;
 *  - `referral_records.rewardPaid` is the fast in-row guard;
 *  - the unique `referralId` constraint on `referral_reward_settlements` is the
 *    durable guard, so a concurrent second attempt loses the race and is
 *    reported as `ALREADY_SETTLED` instead of paying twice.
 */
@Injectable()
export class ReferralRewardSettlementService {
  private readonly logger = new Logger(ReferralRewardSettlementService.name);
  private readonly defaultRewardAmount: number;

  constructor(
    @InjectRepository(ReferralRewardSettlement)
    private readonly settlementRepo: Repository<ReferralRewardSettlement>,
    private readonly dataSource: DataSource,
    private readonly antiAbuseService: AntiAbuseService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const configured = Number(
      this.configService.get(
        REFERRAL_REWARD_AMOUNT_ENV,
        DEFAULT_REFERRAL_REWARD_XLM,
      ),
    );
    this.defaultRewardAmount =
      Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_REFERRAL_REWARD_XLM;
  }

  /**
   * Attempts to settle the referral that brought `referredUserId` into the
   * product after they complete a qualifying action.
   *
   * Returns a structured result instead of throwing for the expected outcomes
   * (no referral, ineligible action, already settled) so callers can react
   * without exception handling.
   */
  async settleReferralReward(
    params: SettleReferralRewardParams,
  ): Promise<ReferralSettlementResult> {
    const { referredUserId, qualifyingAction, referenceId } = params;

    if (!isReferralQualifyingAction(qualifyingAction)) {
      return {
        settled: false,
        reason: ReferralSettlementReason.INELIGIBLE_ACTION,
      };
    }

    const amount = params.amount ?? this.defaultRewardAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return { settled: false, reason: ReferralSettlementReason.INVALID_AMOUNT };
    }

    const currency = params.currency ?? DEFAULT_REFERRAL_REWARD_CURRENCY;

    try {
      return await runAtomicMoneyMovement(this.dataSource, (manager) =>
        this.settleWithinTransaction(manager, {
          referredUserId,
          qualifyingAction,
          amount,
          currency,
          referenceId,
        }),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        this.logger.warn(
          `Concurrent referral settlement for referred user ${referredUserId} — treating as already settled`,
        );
        return {
          settled: false,
          reason: ReferralSettlementReason.ALREADY_SETTLED,
          idempotent: true,
        };
      }
      throw error;
    }
  }

  /** Settlement ledger for a referrer, newest first. */
  async getMyReferralRewards(
    userId: string,
  ): Promise<ReferralRewardSettlement[]> {
    return this.settlementRepo.find({
      where: { referrerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Qualifying-action listener: a health task completion was verified.
   *
   * Every verified completion is offered to the settlement service, which
   * enforces the criteria and pays each referral at most once — later
   * completions are reported as `ALREADY_SETTLED` rather than double-paying.
   * Failures are swallowed (and logged) so a settlement problem never breaks
   * the task-completion flow that emitted the event.
   */
  @OnEvent('task.verified', { async: true })
  async handleTaskVerified(payload: {
    userId?: string;
    completionId?: string;
  }): Promise<void> {
    if (!payload?.userId) {
      return;
    }
    try {
      await this.settleReferralReward({
        referredUserId: payload.userId,
        qualifyingAction: ReferralQualifyingAction.FIRST_HEALTH_TASK_COMPLETION,
        referenceId: payload.completionId,
      });
    } catch (error) {
      this.logger.error(
        `Referral settlement failed for user ${payload.userId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private async settleWithinTransaction(
    manager: EntityManager,
    input: {
      referredUserId: string;
      qualifyingAction: string;
      amount: number;
      currency: Currency;
      referenceId?: string;
    },
  ): Promise<ReferralSettlementResult> {
    const referralRepo = manager.getRepository(ReferralRecord);
    const settlementRepo = manager.getRepository(ReferralRewardSettlement);
    const rewardRepo = manager.getRepository(RewardTransaction);
    const userRepo = manager.getRepository(User);

    const referral = await referralRepo.findOne({
      where: { referred: { id: input.referredUserId } },
      relations: ['referrer', 'referred'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!referral) {
      return { settled: false, reason: ReferralSettlementReason.NO_REFERRAL };
    }

    const referrerId = referral.referrer?.id;
    const referredId = referral.referred?.id;

    const existing = await settlementRepo.findOne({
      where: { referralId: referral.id },
    });

    if (referral.rewardPaid || existing) {
      if (existing) {
        // Repair a stale `rewardPaid` flag left behind by an earlier partial
        // write. The ledger row proves the payout already happened.
        await this.markReferralPaid(
          referralRepo,
          referral,
          existing.settledAt ?? new Date(),
        );
      }
      return {
        settled: false,
        reason: ReferralSettlementReason.ALREADY_SETTLED,
        idempotent: true,
        settlementId: existing?.id,
        rewardTransactionId: existing?.rewardTransactionId ?? undefined,
        referrerId: existing?.referrerId ?? referrerId,
        amount: existing ? Number(existing.amount) : undefined,
        currency: existing?.currency,
        settledAt: existing?.settledAt,
      };
    }

    // ── Eligibility criteria ────────────────────────────────────────────────
    if (!referrerId || !referredId) {
      return { settled: false, reason: ReferralSettlementReason.NO_REFERRAL };
    }
    if (referrerId === referredId) {
      return {
        settled: false,
        reason: ReferralSettlementReason.INELIGIBLE_SELF_REFERRAL,
      };
    }

    const referrer = await userRepo.findOne({
      where: { id: referrerId },
      select: ['id', 'status'],
    });
    if (!referrer || referrer.status !== UserStatus.ACTIVE) {
      return {
        settled: false,
        reason: ReferralSettlementReason.INELIGIBLE_REFERRER,
      };
    }

    // Burst guard: reuses the shared anti-abuse rule set (and audit trail)
    // before any money is recorded.
    await this.antiAbuseService.assertRewardClaimAllowed(
      referrerId,
      input.amount,
      referral.id,
    );

    // ── Record the credit ───────────────────────────────────────────────────
    const rewardTransaction = rewardRepo.create({
      user: { id: referrerId } as User,
      amount: input.amount,
      currency: input.currency,
      status: RewardStatus.PENDING,
    });
    const savedReward = await rewardRepo.save(rewardTransaction);

    const settlement = settlementRepo.create({
      referralId: referral.id,
      referrerId,
      referredId,
      qualifyingAction: input.qualifyingAction,
      amount: input.amount,
      currency: input.currency,
      status: RewardStatus.PENDING,
      rewardTransactionId: savedReward.id,
      metadata: input.referenceId ? { referenceId: input.referenceId } : null,
      settledAt: new Date(),
    });
    const savedSettlement = await settlementRepo.save(settlement);

    referral.rewardPaid = true;
    referral.rewardPaidAt = referral.rewardPaidAt ?? savedSettlement.settledAt;
    await referralRepo.save(referral);

    this.eventEmitter.emit('reward.earned', {
      userId: referrerId,
      amount: input.amount,
      currency: input.currency,
      settlementId: savedSettlement.id,
      rewardTransactionId: savedReward.id,
    });

    this.logger.log(
      `Settled referral ${referral.id}: referrer=${referrerId} amount=${input.amount} ${input.currency} tx=${savedReward.id}`,
    );

    return {
      settled: true,
      reason: ReferralSettlementReason.SETTLED,
      settlementId: savedSettlement.id,
      rewardTransactionId: savedReward.id,
      referrerId,
      amount: input.amount,
      currency: input.currency,
      settledAt: savedSettlement.settledAt,
    };
  }

  private async markReferralPaid(
    referralRepo: Repository<ReferralRecord>,
    referral: ReferralRecord,
    at: Date,
  ): Promise<void> {
    if (referral.rewardPaid && referral.rewardPaidAt) {
      return;
    }
    referral.rewardPaid = true;
    referral.rewardPaidAt = referral.rewardPaidAt ?? at;
    await referralRepo.save(referral);
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = (
      error as QueryFailedError & { driverError?: { code?: string } }
    ).driverError;
    return (
      driverError?.code === '23505' || /duplicate key value/i.test(error.message)
    );
  }
}
