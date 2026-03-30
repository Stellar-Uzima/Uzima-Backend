import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { User } from '../entities/user.entity';
import { RewardsScheduler } from './rewards.scheduler';

describe('RewardsScheduler', () => {
  let scheduler: RewardsScheduler;

  const mockUserRepository = {
    count: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardsScheduler,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    scheduler = module.get<RewardsScheduler>(RewardsScheduler);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should reset users in batches', async () => {
    mockUserRepository.count.mockResolvedValue(2);
    mockUserRepository.find
      .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }])
      .mockResolvedValueOnce([]);
    mockUserRepository.update.mockResolvedValue({ affected: 2 });

    const result = await scheduler.resetDailyRewardsManually();

    expect(mockUserRepository.update).toHaveBeenCalledWith(
      { id: In(['user-1', 'user-2']) },
      { dailyXlmEarned: 0 },
    );
    expect(result.resetCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });

  it('should continue when a batch update fails', async () => {
    mockUserRepository.count.mockResolvedValue(2);
    mockUserRepository.find
      .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }])
      .mockResolvedValueOnce([]);
    mockUserRepository.update
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockResolvedValueOnce({ affected: 1 })
      .mockRejectedValueOnce(new Error('user failed'));

    const result = await scheduler.resetDailyRewardsManually();

    expect(mockUserRepository.update).toHaveBeenNthCalledWith(
      2,
      { id: 'user-1' },
      { dailyXlmEarned: 0 },
    );
    expect(mockUserRepository.update).toHaveBeenNthCalledWith(
      3,
      { id: 'user-2' },
      { dailyXlmEarned: 0 },
    );
    expect(result.resetCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });
});
