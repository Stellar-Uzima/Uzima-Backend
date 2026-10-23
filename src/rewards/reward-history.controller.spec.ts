import { RewardController } from './reward.controller';

describe('RewardController history', () => {
  it('uses the authenticated user context and returns history through /history', async () => {
    const rewardService = { getRewardHistory: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new RewardController(rewardService as any);

    const query = { page: 2, limit: 10 };
    await expect(
      controller.getHistory({ user: { userId: 'user-1' } }, query as any)
    ).resolves.toEqual({ data: [] });
    expect(rewardService.getRewardHistory).toHaveBeenCalledWith('user-1', query);
  });

  it('supports the JWT subject and legacy id fields without accepting a request-supplied user id', async () => {
    const rewardService = { getRewardHistory: jest.fn().mockResolvedValue({ data: [] }) };
    const controller = new RewardController(rewardService as any);

    await controller.getHistory(
      { user: { sub: 'user-2' }, query: { userId: 'other-user' } },
      {} as any
    );
    expect(rewardService.getRewardHistory).toHaveBeenCalledWith('user-2', {});

    await controller.getHistory({ user: { id: 'user-3' } }, {} as any);
    expect(rewardService.getRewardHistory).toHaveBeenLastCalledWith('user-3', {});
  });

  it('rejects a request without an authenticated user context', async () => {
    const controller = new RewardController({ getRewardHistory: jest.fn() } as any);

    await expect(controller.getHistory({}, {} as any)).rejects.toThrow(
      'Authenticated user context is missing'
    );
  });
});
