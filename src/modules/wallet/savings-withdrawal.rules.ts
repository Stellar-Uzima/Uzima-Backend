import { BadRequestException } from '@nestjs/common';
import { SavingsGoal, SavingsGoalStatus } from '../../database/entities/savings-goal.entity';

export const SAVINGS_WITHDRAWAL_LIMITS = {
  minAmount: 0.01,
  // Share of current savings that can leave a still-locked goal in one request
  maxEarlyWithdrawalRatio: 0.5,
  // Per goal, rolling 24h window
  maxWithdrawalsPerDay: 3,
};

export interface SavingsWithdrawalContext {
  goal: Pick<SavingsGoal, 'status' | 'currentAmount' | 'targetDate'>;
  amount: number;
  pendingContributions: number;
  withdrawalsInLastDay: number;
  now: Date;
}

/**
 * A goal is locked while it is still being saved towards (ACTIVE or PAUSED)
 * and its target date has not passed. Completed or cancelled goals, and goals
 * past their target date, release their funds without the early-withdrawal cap.
 */
export function isGoalLocked(
  goal: Pick<SavingsGoal, 'status' | 'targetDate'>,
  now: Date,
): boolean {
  if (goal.status !== SavingsGoalStatus.ACTIVE && goal.status !== SavingsGoalStatus.PAUSED) {
    return false;
  }
  return !goal.targetDate || new Date(goal.targetDate).getTime() > now.getTime();
}

/**
 * Returns the largest amount that may be withdrawn from the goal right now.
 */
export function getMaxWithdrawable(
  goal: Pick<SavingsGoal, 'status' | 'currentAmount' | 'targetDate'>,
  now: Date,
): number {
  const balance = Number(goal.currentAmount);
  const max = isGoalLocked(goal, now)
    ? balance * SAVINGS_WITHDRAWAL_LIMITS.maxEarlyWithdrawalRatio
    : balance;
  return Math.floor(max * 1e7) / 1e7;
}

/**
 * Enforces withdrawal eligibility. Throws before anything is written so a
 * rejected withdrawal never touches goal, contribution or wallet records.
 */
export function assertSavingsWithdrawalAllowed(ctx: SavingsWithdrawalContext): void {
  const { goal, amount, now } = ctx;
  const balance = Number(goal.currentAmount);

  if (!(amount >= SAVINGS_WITHDRAWAL_LIMITS.minAmount)) {
    throw new BadRequestException(
      `Minimum withdrawal is ${SAVINGS_WITHDRAWAL_LIMITS.minAmount} XLM`,
    );
  }

  if (ctx.pendingContributions > 0) {
    throw new BadRequestException(
      'Cannot withdraw while contributions to this goal are pending',
    );
  }

  if (balance <= 0) {
    throw new BadRequestException('This savings goal has no funds to withdraw');
  }

  if (amount > balance) {
    throw new BadRequestException(
      `Withdrawal of ${amount} XLM exceeds goal balance of ${balance.toFixed(7)} XLM`,
    );
  }

  const maxWithdrawable = getMaxWithdrawable(goal, now);
  if (amount > maxWithdrawable) {
    throw new BadRequestException(
      `Goal is still in progress; early withdrawals are limited to ${
        SAVINGS_WITHDRAWAL_LIMITS.maxEarlyWithdrawalRatio * 100
      }% of savings. Max allowed: ${maxWithdrawable.toFixed(7)} XLM`,
    );
  }

  if (ctx.withdrawalsInLastDay >= SAVINGS_WITHDRAWAL_LIMITS.maxWithdrawalsPerDay) {
    throw new BadRequestException(
      `Daily withdrawal limit of ${SAVINGS_WITHDRAWAL_LIMITS.maxWithdrawalsPerDay} reached for this goal`,
    );
  }
}
