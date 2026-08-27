import { Test, TestingModule } from '@nestjs/testing';
import { RewardProcessor } from './reward.processor';
import { RewardService } from './reward.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bull';

describe('RewardProcessor', () => {
  let processor: RewardProcessor;
  let rewardService: RewardService;
  let eventEmitter: EventEmitter2;
  let rewardQueue: Queue;
  let dlq: Queue<any>;//

  const mockRewardService = {
    processRewardJob: jest.fn(),
    handleRewardFailure: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockRewardQueue = {
    add: jest.fn(),
  };

  const mockDLQ = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardProcessor,
        {
          provide: RewardService,
          useValue: mockRewardService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: 'BullQueue',
          useValue: mockRewardQueue,
        },
        {
          provide: 'BullQueue',
          useValue: mockDLQ,
        },
      ],
    }).compile();

    processor = module.get<RewardProcessor>(RewardProcessor);
    rewardService = module.get<RewardService>(RewardService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    rewardQueue = module.get<Queue>('BullQueue');
    dlq = module.get<Queue>('BullQueue');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleRewardDistribution', () => {
    it('should process reward job successfully', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
      } as any;

      mockRewardService.processRewardJob.mockResolvedValue(undefined);

      await processor.handleRewardDistribution(mockJob);

      expect(mockRewardService.processRewardJob).toHaveBeenCalledWith(
        'completion-123',
        'user-123',
        100,
      );
    });

    it('should log job processing', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
      } as any;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockRewardService.processRewardJob.mockResolvedValue(undefined);

      await processor.handleRewardDistribution(mockJob);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing job job-123'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('onFailed', () => {
    it('should move job to DLQ and emit event when max attempts reached', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any;

      const mockError = new Error('Network timeout');
      mockRewardService.handleRewardFailure.mockResolvedValue(undefined);
      mockDLQ.add.mockResolvedValue({ id: 'dlq-456' });

      await processor.onFailed(mockJob, mockError);

      expect(mockRewardService.handleRewardFailure).toHaveBeenCalledWith(
        'completion-123',
      );
      expect(mockDLQ.add).toHaveBeenCalledWith(
        'process',
        {
          userId: 'user-123',
          xlmAmount: 100,
          taskCompletionId: 'completion-123',
          errorMessage: 'Network timeout',
          jobId: 'job-123',
          attemptsMade: 3,
          jobType: 'REWARD_DISTRIBUTION_JOB',
          jobData: {
            completionId: 'completion-123',
            userId: 'user-123',
            xlmAmount: 100,
          },
        },
        undefined,
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('reward.failed', {
        userId: 'user-123',
        completionId: 'completion-123',
        error: 'Network timeout',
      });
    });

    it('should not move to DLQ if attempts below threshold', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as any;

      const mockError = new Error('Network timeout');

      await processor.onFailed(mockJob, mockError);

      expect(mockRewardService.handleRewardFailure).not.toHaveBeenCalled();
      expect(mockDLQ.add).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should use default attempts value when opts.attempts is undefined', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
        attemptsMade: 3,
        opts: {},
      } as any;

      const mockError = new Error('Network timeout');
      mockRewardService.handleRewardFailure.mockResolvedValue(undefined);
      mockDLQ.add.mockResolvedValue({ id: 'dlq-456' });

      await processor.onFailed(mockJob, mockError);

      expect(mockRewardService.handleRewardFailure).toHaveBeenCalled();
      expect(mockDLQ.add).toHaveBeenCalled();
    });

    it('should log error when job fails', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any;

      const mockError = new Error('Network timeout');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockRewardService.handleRewardFailure.mockResolvedValue(undefined);
      mockDLQ.add.mockResolvedValue({ id: 'dlq-456' });

      await processor.onFailed(mockJob, mockError);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Job job-123 failed'),
      );

      consoleSpy.mockRestore();
    });

    it('should log warning when job moved to DLQ', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any;

      const mockError = new Error('Network timeout');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockRewardService.handleRewardFailure.mockResolvedValue(undefined);
      mockDLQ.add.mockResolvedValue({ id: 'dlq-456' });

      await processor.onFailed(mockJob, mockError);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('moved to dead letter queue'),
      );

      consoleSpy.mockRestore();
    });
  });
});