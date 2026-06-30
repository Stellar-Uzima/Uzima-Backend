import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { DeadLetterProcessor, DeadLetterJobData } from './dead-letter.processor';
import { Repository } from 'typeorm';
import { FailedRewardJob } from '../entities/failed-reward-job.entity';
import { Queue } from 'bull';

describe('DeadLetterProcessor', () => {
  let processor: DeadLetterProcessor;
  let failedRewardJobRepository: Repository<FailedRewardJob>;
  let rewardQueue: Queue;

  const mockFailedRewardJobRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockRewardQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterProcessor,
        {
          provide: Repository,
          useValue: mockFailedRewardJobRepository,
        },
        {
          provide: 'BullQueue',
          useValue: mockRewardQueue,
        },
      ],
    }).compile();

    processor = module.get<DeadLetterProcessor>(DeadLetterProcessor);
    failedRewardJobRepository = module.get<Repository<FailedRewardJob>>(Repository);
    rewardQueue = module.get<Queue>('BullQueue');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleDeadLetter', () => {
    it('should capture failed job data and save to DB', async () => {
      const jobData: DeadLetterJobData = {
        userId: 'user-123',
        xlmAmount: 100,
        taskCompletionId: 'completion-123',
        errorMessage: 'Payment failed',
        jobId: 'job-456',
        attemptsMade: 3,
        jobType: 'reward_distribution',
        jobData: { taskId: 'task-789' },
      };

      const mockJob = {
        id: 'job-789',
        data: jobData,
      } as any;

      const mockFailedJob = {
        id: 'failed-123',
        userId: jobData.userId,
      };
      mockFailedRewardJobRepository.create.mockReturnValue(mockFailedJob);
      mockFailedRewardJobRepository.save.mockResolvedValue(mockFailedJob);

      const result = await processor.handleDeadLetter(mockJob);

      expect(mockFailedRewardJobRepository.create).toHaveBeenCalledWith({
        userId: jobData.userId,
        xlmAmount: jobData.xlmAmount,
        taskCompletionId: jobData.taskCompletionId,
        errorMessage: jobData.errorMessage,
        jobId: jobData.jobId || mockJob.id?.toString(),
        attemptsMade: jobData.attemptsMade,
        jobType: jobData.jobType,
        jobData: jobData.jobData,
      });
      expect(mockFailedRewardJobRepository.save).toHaveBeenCalledWith(mockFailedJob);
      expect(result).toEqual({ success: true, failedJobId: 'failed-123' });
    });

    it('should use job.id as fallback when jobId is not provided', async () => {
      const jobData: DeadLetterJobData = {
        userId: 'user-123',
        xlmAmount: 100,
        errorMessage: 'Payment failed',
        attemptsMade: 3,
        jobType: 'reward_distribution',
        jobData: {},
      };

      const mockJob = {
        id: 'job-999',
        data: jobData,
      } as any;

      const mockFailedJob = {
        id: 'failed-123',
        userId: jobData.userId,
      };
      mockFailedRewardJobRepository.create.mockReturnValue(mockFailedJob);
      mockFailedRewardJobRepository.save.mockResolvedValue(mockFailedJob);

      await processor.handleDeadLetter(mockJob);

      expect(mockFailedRewardJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-999',
        }),
      );
    });

    it('should log warning and error for failed job', async () => {
      const jobData: DeadLetterJobData = {
        userId: 'user-123',
        xlmAmount: 100,
        taskCompletionId: 'completion-123',
        errorMessage: 'Payment failed',
        jobId: 'job-456',
        attemptsMade: 3,
        jobType: 'reward_distribution',
        jobData: {},
      };

      const mockJob = {
        id: 'job-789',
        data: jobData,
      } as any;

      const mockFailedJob = { id: 'failed-123', userId: jobData.userId };
      mockFailedRewardJobRepository.create.mockReturnValue(mockFailedJob);
      mockFailedRewardJobRepository.save.mockResolvedValue(mockFailedJob);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await processor.handleDeadLetter(mockJob);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing dead letter job'),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dead letter recorded'),
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('replayFailedJob', () => {
    it('should replay failed job by re-adding to reward queue and deleting from DB', async () => {
      const mockFailedJob = {
        id: 'failed-123',
        userId: 'user-123',
        taskCompletionId: 'completion-123',
        xlmAmount: 100,
      };
      mockFailedRewardJobRepository.findOne.mockResolvedValue(mockFailedJob);

      const mockReplayJob = {
        id: 'replay-456',
      };
      mockRewardQueue.add.mockResolvedValue(mockReplayJob);
      mockFailedRewardJobRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await processor.replayFailedJob('failed-123');

      expect(mockFailedRewardJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'failed-123' },
      });
      expect(mockRewardQueue.add).toHaveBeenCalledWith(
        'REWARD_DISTRIBUTION_JOB',
        {
          completionId: mockFailedJob.taskCompletionId,
          userId: mockFailedJob.userId,
          xlmAmount: mockFailedJob.xlmAmount,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      expect(mockFailedRewardJobRepository.delete).toHaveBeenCalledWith('failed-123');
      expect(result).toEqual({ jobId: 'replay-456' });
    });

    it('should throw error if failed job not found', async () => {
      mockFailedRewardJobRepository.findOne.mockResolvedValue(null);

      await expect(processor.replayFailedJob('non-existent')).rejects.toThrow(
        'Failed reward job non-existent not found',
      );
    });

    it('should not delete from DB if re-adding to queue fails', async () => {
      const mockFailedJob = {
        id: 'failed-123',
        userId: 'user-123',
        taskCompletionId: 'completion-123',
        xlmAmount: 100,
      };
      mockFailedRewardJobRepository.findOne.mockResolvedValue(mockFailedJob);
      mockRewardQueue.add.mockRejectedValue(new Error('Queue error'));
      mockFailedRewardJobRepository.delete.mockResolvedValue({ affected: 1 });

      await expect(processor.replayFailedJob('failed-123')).rejects.toThrow('Queue error');
      expect(mockFailedRewardJobRepository.delete).not.toHaveBeenCalled();
    });

    it('should log replay action', async () => {
      const mockFailedJob = {
        id: 'failed-123',
        userId: 'user-123',
        taskCompletionId: 'completion-123',
        xlmAmount: 100,
      };
      mockFailedRewardJobRepository.findOne.mockResolvedValue(mockFailedJob);

      const mockReplayJob = {
        id: 'replay-456',
      };
      mockRewardQueue.add.mockResolvedValue(mockReplayJob);
      mockFailedRewardJobRepository.delete.mockResolvedValue({ affected: 1 });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await processor.replayFailedJob('failed-123');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Replayed failed job failed-123 as replay-456'),
      );

      consoleSpy.mockRestore();
    });
  });
});