import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SavingsService } from './savings.service';
import {
  SavingsContribution,
  SavingsGoal,
  SavingsGoalStatus,
} from '../../database/entities/savings-goal.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from '../../database/entities/wallet-transaction.entity';
import { User } from '../../entities/user.entity';
import {
  assertSavingsWithdrawalAllowed,
  getMaxWithdrawable,
  isGoalLocked,
  SAVINGS_WITHDRAWAL_LIMITS,
} from './savings-withdrawal.rules';

jest.mock('./wallet.service', () => ({ WalletService: class WalletService {} }));
jest.mock('../../stellar/stellar.service', () => ({ StellarService: class StellarService {} }));

const NOW = new Date('2026-06-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');

describe('savings withdrawal rules', () => {
  const ctx = (overrides: Partial<Parameters<typeof assertSavingsWithdrawalAllowed>[0]> = {}) => ({
    goal: { status: SavingsGoalStatus.COMPLETED, currentAmount: 100, targetDate: null },
    amount: 10,
    pendingContributions: 0,
    withdrawalsInLastDay: 0,
    now: NOW,
    ...overrides,
  });

  it('treats active and paused goals before their target date as locked', () => {
    expect(isGoalLocked({ status: SavingsGoalStatus.ACTIVE, targetDate: FUTURE }, NOW)).toBe(true);
    expect(isGoalLocked({ status: SavingsGoalStatus.PAUSED, targetDate: null }, NOW)).toBe(true);
    expect(isGoalLocked({ status: SavingsGoalStatus.ACTIVE, targetDate: PAST }, NOW)).toBe(false);
    expect(isGoalLocked({ status: SavingsGoalStatus.COMPLETED, targetDate: FUTURE }, NOW)).toBe(false);
    expect(isGoalLocked({ status: SavingsGoalStatus.CANCELLED, targetDate: FUTURE }, NOW)).toBe(false);
  });

  it('caps early withdrawals from locked goals', () => {
    const goal = { status: SavingsGoalStatus.ACTIVE, currentAmount: 100, targetDate: FUTURE };
    expect(getMaxWithdrawable(goal, NOW)).toBe(100 * SAVINGS_WITHDRAWAL_LIMITS.maxEarlyWithdrawalRatio);
    expect(() => assertSavingsWithdrawalAllowed(ctx({ goal, amount: 50 }))).not.toThrow();
    expect(() => assertSavingsWithdrawalAllowed(ctx({ goal, amount: 50.01 }))).toThrow(/early withdrawals/);
  });

  it('allows full withdrawal from completed, cancelled, or matured goals', () => {
    for (const goal of [
      { status: SavingsGoalStatus.COMPLETED, currentAmount: 100, targetDate: null },
      { status: SavingsGoalStatus.CANCELLED, currentAmount: 100, targetDate: FUTURE },
      { status: SavingsGoalStatus.ACTIVE, currentAmount: 100, targetDate: PAST },
    ]) {
      expect(() => assertSavingsWithdrawalAllowed(ctx({ goal, amount: 100 }))).not.toThrow();
    }
  });

  it.each([
    ['below minimum', { amount: 0.001 }, /Minimum withdrawal/],
    ['pending contributions', { pendingContributions: 1 }, /pending/],
    ['empty goal', { goal: { status: SavingsGoalStatus.COMPLETED, currentAmount: 0, targetDate: null } }, /no funds/],
    ['more than balance', { amount: 100.5 }, /exceeds goal balance/],
    ['daily limit reached', { withdrawalsInLastDay: SAVINGS_WITHDRAWAL_LIMITS.maxWithdrawalsPerDay }, /Daily withdrawal limit/],
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => assertSavingsWithdrawalAllowed(ctx(overrides as any))).toThrow(BadRequestException);
    expect(() => assertSavingsWithdrawalAllowed(ctx(overrides as any))).toThrow(message);
  });
});

describe('SavingsService.withdraw', () => {
  let goal: Partial<SavingsGoal>;
  let user: Partial<User>;
  let repos: Map<unknown, any>;
  let service: SavingsService;
  let walletService: { invalidateCache: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);

    goal = {
      id: 'goal-1',
      userId: 'user-1',
      title: 'Emergency Fund',
      status: SavingsGoalStatus.ACTIVE,
      currentAmount: 100,
      targetAmount: 500,
      targetDate: FUTURE,
    };
    user = { id: 'user-1', walletBalance: 20 };

    repos = new Map<unknown, any>([
      [SavingsGoal, { findOne: jest.fn(async () => ({ ...goal })), save: jest.fn() }],
      [SavingsContribution, { count: jest.fn(async () => 0), save: jest.fn() }],
      [
        WalletTransaction,
        {
          count: jest.fn(async () => 0),
          create: jest.fn((value) => ({ ...value, id: 'tx-1', createdAt: NOW })),
          save: jest.fn(),
        },
      ],
      [User, { findOne: jest.fn(async () => ({ ...user })), save: jest.fn() }],
    ]);

    const dataSource = {
      transaction: jest.fn(async (work) => work({ getRepository: (entity: unknown) => repos.get(entity) })),
    };
    walletService = { invalidateCache: jest.fn() };
    eventEmitter = { emit: jest.fn() };

    service = new SavingsService(
      { findOne: jest.fn(async () => goal) } as any,
      {} as any,
      {} as any,
      {} as any,
      { del: jest.fn() } as any,
      eventEmitter as any,
      walletService as any,
      {} as any,
      dataSource as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  const expectNothingWritten = () => {
    for (const repo of repos.values()) {
      expect(repo.save).not.toHaveBeenCalled();
    }
    expect(walletService.invalidateCache).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  };

  it('moves funds from the goal to the wallet and records a transaction', async () => {
    const result = await service.withdraw('user-1', 'goal-1', { amount: 30 });

    expect(result).toEqual(
      expect.objectContaining({ transactionId: 'tx-1', amount: 30, goalBalance: 70, walletBalance: 50 }),
    );
    expect(repos.get(SavingsGoal).save).toHaveBeenCalledWith(expect.objectContaining({ currentAmount: 70 }));
    expect(repos.get(User).save).toHaveBeenCalledWith(expect.objectContaining({ walletBalance: 50 }));
    expect(repos.get(WalletTransaction).save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WalletTransactionType.SAVINGS_WITHDRAWAL,
        status: WalletTransactionStatus.CONFIRMED,
        referenceId: 'goal-1',
        balanceBefore: 20,
        balanceAfter: 50,
      }),
    );
    expect(repos.get(SavingsContribution).save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith('savings.withdrawal.confirmed', expect.anything());
  });

  it('checks limits against the locked goal and writes nothing when rejected', async () => {
    await expect(service.withdraw('user-1', 'goal-1', { amount: 60 })).rejects.toThrow(/early withdrawals/);
    expectNothingWritten();
    expect(repos.get(User).findOne).not.toHaveBeenCalled();
  });

  it('rejects when contributions are pending without touching records', async () => {
    repos.get(SavingsContribution).count.mockResolvedValue(2);
    await expect(service.withdraw('user-1', 'goal-1', { amount: 10 })).rejects.toThrow(/pending/);
    expectNothingWritten();
  });

  it('rejects once the daily withdrawal limit is reached', async () => {
    repos.get(WalletTransaction).count.mockResolvedValue(SAVINGS_WITHDRAWAL_LIMITS.maxWithdrawalsPerDay);
    await expect(service.withdraw('user-1', 'goal-1', { amount: 10 })).rejects.toThrow(/Daily withdrawal limit/);
    expectNothingWritten();
  });

  it('returns 404 for a goal the user does not own', async () => {
    (service as any).goalRepo.findOne.mockResolvedValue(null);
    await expect(service.withdraw('user-1', 'goal-1', { amount: 10 })).rejects.toThrow(NotFoundException);
    expectNothingWritten();
  });
});
