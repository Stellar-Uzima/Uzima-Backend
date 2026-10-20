import { RewardService } from './reward.service';
import { RewardStatus } from './enums/reward-status.enum';

describe('RewardService reward history', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };
  const rewardRepo = { createQueryBuilder: jest.fn(() => queryBuilder) };
  const cacheManager = { get: jest.fn(), set: jest.fn() };
  const service = new RewardService(rewardRepo as any, cacheManager as any);

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.get.mockResolvedValue(undefined);
    cacheManager.set.mockResolvedValue(undefined);
  });

  it('scopes, orders, paginates, and maps reward transactions', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    queryBuilder.getManyAndCount.mockResolvedValue([
      [
        {
          id: 'reward-1',
          amount: 12.5,
          status: RewardStatus.SUCCESS,
          stellarTxHash: 'stellar-hash',
          createdAt,
          task_completion: { task: { title: 'Walk 10,000 steps', categoryId: 'fitness' } },
        },
      ],
      3,
    ]);

    await expect(service.getRewardHistory('user-1', { page: 2, limit: 1 })).resolves.toEqual({
      data: [
        {
          id: 'reward-1',
          eventType: 'reward_transaction',
          amount: 12.5,
          status: RewardStatus.SUCCESS,
          createdAt,
          stellarTxHash: 'stellar-hash',
          taskTitle: 'Walk 10,000 steps',
          categoryId: 'fitness',
        },
      ],
      total: 3,
      page: 2,
      limit: 1,
      totalPages: 3,
    });

    expect(queryBuilder.where).toHaveBeenCalledWith('reward_transaction.userId = :userId', {
      userId: 'user-1',
    });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('reward_transaction.createdAt', 'DESC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('reward_transaction.id', 'DESC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(1);
    expect(queryBuilder.take).toHaveBeenCalledWith(1);
  });

  it("returns an empty page without leaking another user's records", async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await expect(
      service.getRewardHistory('user-with-no-rewards', { page: 1, limit: 20 })
    ).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    expect(queryBuilder.where).toHaveBeenCalledWith('reward_transaction.userId = :userId', {
      userId: 'user-with-no-rewards',
    });
  });
});
