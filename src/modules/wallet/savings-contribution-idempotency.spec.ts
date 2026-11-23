import { BadRequestException, ConflictException } from '@nestjs/common';
import { SavingsService } from './savings.service';
import {
  ContributionStatus,
  SavingsContribution,
  SavingsGoal,
  SavingsGoalStatus,
} from '../../database/entities/savings-goal.entity';
import { WalletTransaction } from '../../database/entities/wallet-transaction.entity';
import { User } from '../../entities/user.entity';

jest.mock('./wallet.service', () => ({ WalletService: class WalletService {} }));
jest.mock('../../stellar/stellar.service', () => ({ StellarService: class StellarService {} }));

/**
 * #1516: contribution requests carrying an Idempotency-Key must be safe to retry.
 * Uses a small in-memory store so balances and ledger rows can be asserted.
 */
describe('SavingsService.contribute idempotency', () => {
  let goals: Map<string, SavingsGoal>;
  let user: User;
  let contributionRows: SavingsContribution[];
  let ledgerRows: Partial<WalletTransaction>[];
  let service: SavingsService;
  let eventEmitter: { emit: jest.Mock };
  let nextId: number;

  const findContribution = async ({ where }: { where: Partial<SavingsContribution> }) =>
    contributionRows.find(
      (row) => row.userId === where.userId && row.idempotencyKey === where.idempotencyKey,
    ) ?? null;

  const contributionRepo = {
    findOne: jest.fn(findContribution),
    create: jest.fn((value: Partial<SavingsContribution>) => ({ ...value }) as SavingsContribution),
    save: jest.fn(async (row: SavingsContribution) => {
      if (
        row.idempotencyKey &&
        contributionRows.some(
          (r) => r.userId === row.userId && r.idempotencyKey === row.idempotencyKey,
        )
      ) {
        // Mirrors the unique (user_id, idempotency_key) index.
        throw Object.assign(new Error('duplicate key'), { driverError: { code: '23505' } });
      }
      Object.assign(row, {
        id: `contribution-${nextId++}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      contributionRows.push(row);
      return row;
    }),
  };

  const makeGoal = (id: string): SavingsGoal =>
    ({
      id,
      userId: 'user-1',
      title: `Goal ${id}`,
      status: SavingsGoalStatus.ACTIVE,
      currentAmount: 0,
      targetAmount: 1000,
    }) as SavingsGoal;

  beforeEach(() => {
    nextId = 1;
    goals = new Map([
      ['goal-1', makeGoal('goal-1')],
      ['goal-2', makeGoal('goal-2')],
    ]);
    user = { id: 'user-1', walletBalance: 100 } as User;
    contributionRows = [];
    ledgerRows = [];
    contributionRepo.findOne.mockClear();
    contributionRepo.save.mockClear();

    const goalRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
        const goal = goals.get(where.id);
        return goal ? { ...goal } : null;
      }),
      save: jest.fn(async (goal: SavingsGoal) => goals.set(goal.id, { ...goal })),
    };
    const repos = new Map<unknown, unknown>([
      [SavingsGoal, goalRepo],
      [SavingsContribution, contributionRepo],
      [
        WalletTransaction,
        {
          create: jest.fn((value: Partial<WalletTransaction>) => ({ ...value })),
          save: jest.fn(async (row: Partial<WalletTransaction>) => ledgerRows.push(row)),
        },
      ],
      [
        User,
        {
          findOne: jest.fn(async () => ({ ...user })),
          save: jest.fn(async (saved: User) => {
            user = { ...saved };
          }),
        },
      ],
    ]);

    const dataSource = {
      // Simulates rollback: state changes made inside a failed transaction are discarded.
      transaction: jest.fn(async (work: (manager: unknown) => Promise<unknown>) => {
        const snapshot = {
          goals: new Map([...goals].map(([k, v]) => [k, { ...v }])),
          user: { ...user },
          contributions: [...contributionRows],
          ledger: [...ledgerRows],
        };
        try {
          return await work({ getRepository: (entity: unknown) => repos.get(entity) });
        } catch (error) {
          goals = snapshot.goals;
          user = snapshot.user;
          contributionRows = snapshot.contributions;
          ledgerRows = snapshot.ledger;
          throw error;
        }
      }),
    };

    eventEmitter = { emit: jest.fn() };

    service = new SavingsService(
      goalRepo as any,
      contributionRepo as any,
      {} as any,
      {} as any,
      { del: jest.fn() } as any,
      eventEmitter as any,
      {
        getWalletSummary: jest.fn(async () => ({ walletLinked: true, liveBalance: '1000' })),
        invalidateCache: jest.fn(),
      } as any,
      {} as any,
      dataSource as any,
    );
  });

  it('posts once and returns the original result for a repeated key', async () => {
    const first = await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    const retry = await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');

    expect(retry).toEqual(first);
    expect(first.status).toBe(ContributionStatus.CONFIRMED);
    expect(contributionRows).toHaveLength(1);
    expect(ledgerRows).toHaveLength(1);
    expect(user.walletBalance).toBe(75);
    expect(Number(goals.get('goal-1')!.currentAmount)).toBe(25);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
  });

  it('returns the original result even when the goal has since completed', async () => {
    goals.get('goal-1')!.targetAmount = 25;
    const first = await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    expect(goals.get('goal-1')!.status).toBe(SavingsGoalStatus.COMPLETED);

    const retry = await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    expect(retry).toEqual(first);
    expect(user.walletBalance).toBe(75);
  });

  it('does not post twice when the duplicate passed the fast-path check (in-flight retry)', async () => {
    await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    // Simulate a retry that was already past the initial lookup when the first committed.
    contributionRepo.findOne.mockImplementationOnce(async () => null);

    const retry = await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    expect(retry.id).toBe('contribution-1');
    expect(contributionRows).toHaveLength(1);
    expect(user.walletBalance).toBe(75);
  });

  it('falls back to the unique index and changes no balance when a duplicate races through', async () => {
    await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    // Both lookups miss, as if the first request committed just after them.
    contributionRepo.findOne
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => null);

    const retry = await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    expect(retry.id).toBe('contribution-1');
    expect(contributionRows).toHaveLength(1);
    expect(ledgerRows).toHaveLength(1);
    expect(user.walletBalance).toBe(75);
    expect(Number(goals.get('goal-1')!.currentAmount)).toBe(25);
  });

  it.each([
    ['a different amount', 'goal-1', 30],
    ['a different goal', 'goal-2', 25],
  ])('rejects a key reused for %s with 409 and moves no funds', async (_label, goalId, amount) => {
    await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');

    await expect(
      service.contribute('user-1', goalId, { amount }, 'key-abc'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(contributionRows).toHaveLength(1);
    expect(user.walletBalance).toBe(75);
  });

  it('scopes keys per user', async () => {
    await service.contribute('user-1', 'goal-1', { amount: 25 }, 'key-abc');
    const found = await findContribution({
      where: { userId: 'user-2', idempotencyKey: 'key-abc' },
    });
    expect(found).toBeNull();
    expect(contributionRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1', idempotencyKey: 'key-abc' },
    });
  });

  it('posts separately for distinct keys and when no key is sent', async () => {
    await service.contribute('user-1', 'goal-1', { amount: 10 }, 'key-1');
    await service.contribute('user-1', 'goal-1', { amount: 10 }, 'key-2');
    await service.contribute('user-1', 'goal-1', { amount: 10 });
    await service.contribute('user-1', 'goal-1', { amount: 10 });

    expect(contributionRows).toHaveLength(4);
    expect(user.walletBalance).toBe(60);
  });

  it('treats a blank key as no key and rejects an over-long key', async () => {
    await service.contribute('user-1', 'goal-1', { amount: 10 }, '   ');
    expect(contributionRows[0].idempotencyKey).toBeNull();

    await expect(
      service.contribute('user-1', 'goal-1', { amount: 10 }, 'k'.repeat(256)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(contributionRows).toHaveLength(1);
  });
});
