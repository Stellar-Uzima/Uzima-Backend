import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityFeedService } from './activity-feed.service';
import { TaskCompletion } from '../../../tasks/entities/task-completion.entity';
import { TaskCompletionStatus } from '../../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../../../rewards/enums/reward-status.enum';
import { Coupon } from '../../../coupons/entities/coupon.entity';

describe('ActivityFeedService', () => {
  let service: ActivityFeedService;

  const mockTaskCompletionRepo = {
    find: jest.fn(),
  };
  const mockRewardRepo = {
    find: jest.fn(),
  };
  const mockCouponRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedService,
        {
          provide: getRepositoryToken(TaskCompletion),
          useValue: mockTaskCompletionRepo,
        },
        {
          provide: getRepositoryToken(RewardTransaction),
          useValue: mockRewardRepo,
        },
        {
          provide: getRepositoryToken(Coupon),
          useValue: mockCouponRepo,
        },
      ],
    }).compile();

    service = module.get(ActivityFeedService);
  });

  it('returns chronological activity across tasks, rewards, and badges', async () => {
    mockTaskCompletionRepo.find.mockResolvedValue([
      {
        id: 'tc-1',
        status: TaskCompletionStatus.VERIFIED,
        completedAt: new Date('2026-05-01T12:00:00Z'),
        xlmRewarded: 5,
        task: { id: 'task-1', title: 'Morning walk' },
      },
    ]);
    mockRewardRepo.find.mockResolvedValue([
      {
        id: 'rt-1',
        status: RewardStatus.SUCCESS,
        amount: 10,
        createdAt: new Date('2026-05-02T12:00:00Z'),
        taskCompletionId: 'tc-1',
      },
    ]);
    mockCouponRepo.find.mockResolvedValue([
      {
        id: 'cp-1',
        code: 'ABCD1234',
        discount: 15,
        specialistType: 'nutrition',
        createdAt: new Date('2026-05-03T12:00:00Z'),
      },
    ]);

    const result = await service.getActivityFeed('user-1', 1, 10);

    expect(result.total).toBe(3);
    expect(result.data.map((item) => item.type)).toEqual([
      'badge_earned',
      'reward_earned',
      'task_completed',
    ]);
  });

  it('paginates results with page and limit', async () => {
    mockTaskCompletionRepo.find.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `tc-${i}`,
        status: TaskCompletionStatus.VERIFIED,
        completedAt: new Date(`2026-05-0${i + 1}T12:00:00Z`),
        xlmRewarded: 1,
        task: { id: `task-${i}`, title: `Task ${i}` },
      })),
    );
    mockRewardRepo.find.mockResolvedValue([]);
    mockCouponRepo.find.mockResolvedValue([]);

    const result = await service.getActivityFeed('user-1', 2, 2);

    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.total).toBe(5);
    expect(result.data).toHaveLength(2);
    expect(result.totalPages).toBe(3);
  });
});
