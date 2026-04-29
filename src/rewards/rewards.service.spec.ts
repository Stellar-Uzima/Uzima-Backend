import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RewardService } from './reward.service';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { RewardStatus } from './enums/reward-status.enum';
import { TaskCompletion } from '../task-completion/entities/task-completion.entity';
import { HealthTask } from '../entities/health-task.entity';
import {
  REWARD_QUEUE,
  REWARD_DISTRIBUTION_JOB,
} from '../queue/queue.constants';
import { REWARD_MILESTONE_EVENT } from '../coupons/coupon.events';

describe('RewardService', () => {
  let service: RewardService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
  };

  const mockRewardTransactionRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockTaskCompletionRepo = {};
  const mockHealthTaskRepo = {};

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockRewardQueue = {
    add: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardService,
        { provide: getRepositoryToken(RewardTransaction), useValue: mockRewardTransactionRepo },
        { provide: getRepositoryToken(TaskCompletion), useValue: mockTaskCompletionRepo },
        { provide: getRepositoryToken(HealthTask), useValue: mockHealthTaskRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getQueueToken(REWARD_QUEUE), useValue: mockRewardQueue },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<RewardService>(RewardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // handleTaskVerified
  // ──────────────────────────────────────────────────────────────────────────

  describe('handleTaskVerified', () => {
    it('should enqueue a reward distribution job with correct payload', async () => {
      const payload = {
        completionId: 'comp-1',
        userId: 'user-1',
        taskId: 'task-1',
        xlmAmount: 2.5,
      };

      await service.handleTaskVerified(payload);

      expect(mockRewardQueue.add).toHaveBeenCalledTimes(1);
      expect(mockRewardQueue.add).toHaveBeenCalledWith(
        REWARD_DISTRIBUTION_JOB,
        {
          completionId: 'comp-1',
          userId: 'user-1',
          xlmAmount: 2.5,
        },
      );
    });

    it('should not include taskId in the queue job data', async () => {
      const payload = {
        completionId: 'comp-2',
        userId: 'user-2',
        taskId: 'task-99',
        xlmAmount: 0.5,
      };

      await service.handleTaskVerified(payload);

      const jobData = mockRewardQueue.add.mock.calls[0][1];
      expect(jobData).not.toHaveProperty('taskId');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // emitMilestoneIfReached
  // ──────────────────────────────────────────────────────────────────────────

  describe('emitMilestoneIfReached', () => {
    it('should emit milestone events for all milestones crossed', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: '55.00' });

      await service.emitMilestoneIfReached('user-1');

      // 55 XLM crosses milestones: 10, 25, 50 (not 100, not 250)
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(3);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        REWARD_MILESTONE_EVENT,
        { userId: 'user-1', totalXlm: 55, milestoneReached: 10 },
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        REWARD_MILESTONE_EVENT,
        { userId: 'user-1', totalXlm: 55, milestoneReached: 25 },
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        REWARD_MILESTONE_EVENT,
        { userId: 'user-1', totalXlm: 55, milestoneReached: 50 },
      );
    });

    it('should emit all 5 milestone events when total is 250 or above', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: '300.00' });

      await service.emitMilestoneIfReached('user-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(5);
      const emittedMilestones = mockEventEmitter.emit.mock.calls.map(
        (call) => call[1].milestoneReached,
      );
      expect(emittedMilestones).toEqual([10, 25, 50, 100, 250]);
    });

    it('should emit no events when total is below first milestone', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: '9.99' });

      await service.emitMilestoneIfReached('user-1');

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should emit exactly one event when total equals the first milestone', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: '10.00' });

      await service.emitMilestoneIfReached('user-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        REWARD_MILESTONE_EVENT,
        { userId: 'user-1', totalXlm: 10, milestoneReached: 10 },
      );
    });

    it('should handle null sum gracefully (no rewards yet)', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: null });

      await service.emitMilestoneIfReached('user-1');

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should query only SUCCESS reward transactions', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ sum: '0' });

      await service.emitMilestoneIfReached('user-1');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rt.status = :status',
        { status: RewardStatus.SUCCESS },
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getRewardHistory
  // ──────────────────────────────────────────────────────────────────────────

  describe('getRewardHistory', () => {
    const userId = 'user-1';

    const mockTransactions: Partial<RewardTransaction>[] = [
      {
        id: 'tx-1',
        amount: 2.5,
        status: RewardStatus.SUCCESS,
        stellarTxHash: 'hash-1',
        createdAt: new Date('2024-06-01'),
        task_completion: {
          health_task: { title: 'Drink Water', categoryId: 'cat-hydration' },
        } as any,
      },
      {
        id: 'tx-2',
        amount: 1.0,
        status: RewardStatus.PENDING,
        stellarTxHash: null,
        createdAt: new Date('2024-06-02'),
        task_completion: {
          health_task: { title: '10k Steps', categoryId: 'cat-fitness' },
        } as any,
      },
    ];

    it('should return cached result when available', async () => {
      const cachedResult = { data: [], page: 1, limit: 20, total: 0, totalPages: 0 };
      mockCacheManager.get.mockResolvedValue(cachedResult);

      const result = await service.getRewardHistory(userId, {});

      expect(result).toBe(cachedResult);
      expect(mockRewardTransactionRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query database and cache result on cache miss', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(2);
      mockQueryBuilder.getMany.mockResolvedValue(mockTransactions);

      const queryDto = { page: 1, limit: 20 };
      const result = await service.getRewardHistory(userId, queryDto);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);

      // Verify cache was set with 2-minute TTL
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('reward_history:user-1:'),
        result,
        120000,
      );
    });

    it('should only expose stellarTxHash for SUCCESS transactions', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(2);
      mockQueryBuilder.getMany.mockResolvedValue(mockTransactions);

      const result = await service.getRewardHistory(userId, {});

      // First tx is SUCCESS — hash visible
      expect(result.data[0].stellarTxHash).toBe('hash-1');
      // Second tx is PENDING — hash hidden
      expect(result.data[1].stellarTxHash).toBeUndefined();
    });

    it('should use "Unknown Task" when health_task is missing', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(1);
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'tx-3',
          amount: 0.5,
          status: RewardStatus.SUCCESS,
          stellarTxHash: 'hash-3',
          createdAt: new Date(),
          task_completion: null,
        },
      ]);

      const result = await service.getRewardHistory(userId, {});

      expect(result.data[0].taskTitle).toBe('Unknown Task');
    });

    it('should apply date range filters when provided', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getRewardHistory(userId, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'reward_transaction.createdAt >= :startDate',
        { startDate: new Date('2024-01-01') },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'reward_transaction.createdAt <= :endDate',
        { endDate: new Date('2024-12-31') },
      );
    });

    it('should apply category filter when provided', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getRewardHistory(userId, { categoryId: 'cat-fitness' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'health_task.categoryId = :categoryId',
        { categoryId: 'cat-fitness' },
      );
    });

    it('should calculate correct pagination offset', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(50);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getRewardHistory(userId, { page: 3, limit: 10 });

      // skip = (3 - 1) * 10 = 20
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should calculate totalPages correctly', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(25);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getRewardHistory(userId, { page: 1, limit: 10 });

      // ceil(25 / 10) = 3
      expect(result.totalPages).toBe(3);
    });

    it('should default to page 1 and limit 20 when not provided', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getRewardHistory(userId, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // processRewardJob
  // ──────────────────────────────────────────────────────────────────────────

  describe('processRewardJob', () => {
    it('should create a new transaction when none exists for the completion', async () => {
      mockRewardTransactionRepo.findOne.mockResolvedValue(null);
      const created = {
        attempts: 0,
        status: RewardStatus.PENDING,
      };
      mockRewardTransactionRepo.create.mockReturnValue(created);
      mockRewardTransactionRepo.save.mockResolvedValue(created);

      await service.processRewardJob('comp-1', 'user-1', 3.0);

      expect(mockRewardTransactionRepo.create).toHaveBeenCalledWith({
        user: { id: 'user-1' },
        task_completion: { id: 'comp-1' },
        amount: 3.0,
        status: RewardStatus.PENDING,
        attempts: 0,
      });
      expect(mockRewardTransactionRepo.save).toHaveBeenCalled();
    });

    it('should reuse existing transaction when one already exists', async () => {
      const existing = {
        id: 'tx-existing',
        attempts: 1,
        status: RewardStatus.PENDING,
      };
      mockRewardTransactionRepo.findOne.mockResolvedValue(existing);
      mockRewardTransactionRepo.save.mockResolvedValue(existing);

      await service.processRewardJob('comp-1', 'user-1', 3.0);

      // Should NOT create a new one
      expect(mockRewardTransactionRepo.create).not.toHaveBeenCalled();
      // Attempts should be incremented
      expect(existing.attempts).toBe(2);
    });

    it('should set status to SUCCESS and assign stellarTxHash on success', async () => {
      const transaction = {
        attempts: 0,
        status: RewardStatus.PENDING,
        stellarTxHash: null,
      };
      mockRewardTransactionRepo.findOne.mockResolvedValue(null);
      mockRewardTransactionRepo.create.mockReturnValue(transaction);
      mockRewardTransactionRepo.save.mockResolvedValue(transaction);

      await service.processRewardJob('comp-1', 'user-1', 1.5);

      expect(transaction.status).toBe(RewardStatus.SUCCESS);
      expect(transaction.stellarTxHash).toMatch(/^dummy_stellar_tx_hash_\d+$/);
    });

    it('should increment attempts on each call', async () => {
      const transaction = { attempts: 2, status: RewardStatus.PENDING };
      mockRewardTransactionRepo.findOne.mockResolvedValue(transaction);
      mockRewardTransactionRepo.save.mockResolvedValue(transaction);

      await service.processRewardJob('comp-1', 'user-1', 1.0);

      expect(transaction.attempts).toBe(3);
    });

    it('should save transaction twice: once on creation and once on success', async () => {
      const transaction = { attempts: 0, status: RewardStatus.PENDING };
      mockRewardTransactionRepo.findOne.mockResolvedValue(null);
      mockRewardTransactionRepo.create.mockReturnValue(transaction);
      mockRewardTransactionRepo.save.mockResolvedValue(transaction);

      await service.processRewardJob('comp-1', 'user-1', 2.0);

      // First save: initial creation, second save: status update
      expect(mockRewardTransactionRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // handleRewardFailure
  // ──────────────────────────────────────────────────────────────────────────

  describe('handleRewardFailure', () => {
    it('should set transaction status to FAILED when found', async () => {
      const transaction = { status: RewardStatus.PENDING, attempts: 3 };
      mockRewardTransactionRepo.findOne.mockResolvedValue(transaction);
      mockRewardTransactionRepo.save.mockResolvedValue(transaction);

      await service.handleRewardFailure('comp-1');

      expect(transaction.status).toBe(RewardStatus.FAILED);
      expect(mockRewardTransactionRepo.save).toHaveBeenCalledWith(transaction);
    });

    it('should not throw when transaction is not found', async () => {
      mockRewardTransactionRepo.findOne.mockResolvedValue(null);

      // Should complete without error
      await expect(service.handleRewardFailure('nonexistent')).resolves.not.toThrow();
      expect(mockRewardTransactionRepo.save).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // XLM milestones — boundary conditions
  // ──────────────────────────────────────────────────────────────────────────

  describe('Milestone boundary conditions', () => {
    it.each([
      { sum: '9.99', expectedCount: 0 },
      { sum: '10.00', expectedCount: 1 },
      { sum: '24.99', expectedCount: 1 },
      { sum: '25.00', expectedCount: 2 },
      { sum: '49.99', expectedCount: 2 },
      { sum: '50.00', expectedCount: 3 },
      { sum: '99.99', expectedCount: 3 },
      { sum: '100.00', expectedCount: 4 },
      { sum: '249.99', expectedCount: 4 },
      { sum: '250.00', expectedCount: 5 },
    ])(
      'should emit $expectedCount milestone events when total XLM is $sum',
      async ({ sum, expectedCount }) => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ sum });

        await service.emitMilestoneIfReached('user-1');

        expect(mockEventEmitter.emit).toHaveBeenCalledTimes(expectedCount);
      },
    );
  });
});
