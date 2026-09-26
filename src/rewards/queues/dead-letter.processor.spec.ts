import { DeadLetterJobData, DeadLetterProcessor } from './dead-letter.processor';
import { REWARD_DISTRIBUTION_JOB } from '../../queue/queue.constants';
import { DEFAULT_BACKOFF_MS, DEFAULT_JOB_ATTEMPTS } from '../../queue/queue-policy';

describe('DeadLetterProcessor', () => {
  let processor: DeadLetterProcessor;

  const failedRewardJobRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const rewardQueue = { add: jest.fn() };
  const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };

  const baseJobData = (
    overrides: Partial<DeadLetterJobData> = {},
  ): DeadLetterJobData => ({
    userId: 'user-123',
    xlmAmount: 100,
    taskCompletionId: 'completion-123',
    errorMessage: 'Payment failed',
    jobId: 'job-456',
    attemptsMade: 3,
    jobType: REWARD_DISTRIBUTION_JOB,
    jobData: { taskId: 'task-789' },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new DeadLetterProcessor(
      failedRewardJobRepository as any,
      rewardQueue as any,
    );
    (processor as any).logger = logger;
  });

  describe('handleDeadLetter', () => {
    it('captures the failed reward job and returns its id', async () => {
      failedRewardJobRepository.create.mockReturnValue({ id: 'failed-123' });
      failedRewardJobRepository.save.mockResolvedValue({ id: 'failed-123' });

      const result = await processor.handleDeadLetter({
        id: 'job-789',
        data: baseJobData(),
      } as any);

      expect(failedRewardJobRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        xlmAmount: 100,
        taskCompletionId: 'completion-123',
        errorMessage: 'Payment failed',
        jobId: 'job-456',
        attemptsMade: 3,
        jobType: REWARD_DISTRIBUTION_JOB,
        jobData: { taskId: 'task-789', failureCategory: 'unknown' },
      });
      expect(failedRewardJobRepository.save).toHaveBeenCalledWith({ id: 'failed-123' });
      expect(result).toEqual({ success: true, failedJobId: 'failed-123' });
    });

    it('falls back to the queue job id when the payload has none', async () => {
      failedRewardJobRepository.create.mockReturnValue({ id: 'failed-1' });
      failedRewardJobRepository.save.mockResolvedValue({ id: 'failed-1' });

      await processor.handleDeadLetter({
        id: 'job-999',
        data: baseJobData({ jobId: undefined }),
      } as any);

      expect(failedRewardJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-999' }),
      );
    });

    it('keeps the classified root cause supplied by the producer', async () => {
      failedRewardJobRepository.create.mockReturnValue({ id: 'failed-2' });
      failedRewardJobRepository.save.mockResolvedValue({ id: 'failed-2' });

      await processor.handleDeadLetter({
        id: 'job-1',
        data: baseJobData({
          errorMessage: 'connect ECONNREFUSED 127.0.0.1:6379',
          failureCategory: 'network',
        }),
      } as any);

      expect(failedRewardJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobData: { taskId: 'task-789', failureCategory: 'network' },
        }),
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[network]'));
    });
  });

  describe('getFailureSummary', () => {
    it('groups dead letters by root cause and repeats', async () => {
      failedRewardJobRepository.find.mockResolvedValue([
        { errorMessage: 'Request timed out' },
        { errorMessage: 'Request timed out' },
        { errorMessage: 'ETIMEDOUT while calling Stellar' },
        { errorMessage: 'Validation failed: userId must be a uuid' },
        { errorMessage: 'unknown weather' },
      ]);

      const summary = await processor.getFailureSummary(10);

      expect(failedRewardJobRepository.find).toHaveBeenCalledWith({
        order: { failedAt: 'DESC' },
        take: 10,
      });
      expect(summary.total).toBe(5);
      expect(summary.byCategory).toMatchObject({ timeout: 3, validation: 1, unknown: 1 });
      expect(summary.topErrors[0]).toEqual({ message: 'Request timed out', count: 2 });
      expect(summary.topErrors).toHaveLength(4);
    });

    it('returns zeroed counters when nothing has been dead-lettered', async () => {
      failedRewardJobRepository.find.mockResolvedValue([]);

      const summary = await processor.getFailureSummary();

      expect(failedRewardJobRepository.find).toHaveBeenCalledWith({
        order: { failedAt: 'DESC' },
        take: 500,
      });
      expect(summary).toEqual({
        total: 0,
        byCategory: {
          timeout: 0,
          network: 0,
          'rate-limit': 0,
          validation: 0,
          contract: 0,
          unknown: 0,
        },
        topErrors: [],
      });
    });
  });

  describe('replayFailedJob', () => {
    it('replays with the shared retry policy and deletes the record', async () => {
      failedRewardJobRepository.findOne.mockResolvedValue({
        id: 'failed-123',
        userId: 'user-123',
        taskCompletionId: 'completion-123',
        xlmAmount: 100,
      });
      rewardQueue.add.mockResolvedValue({ id: 'replay-456' });
      failedRewardJobRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await processor.replayFailedJob('failed-123');

      expect(failedRewardJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'failed-123' },
      });
      expect(rewardQueue.add).toHaveBeenCalledWith(
        REWARD_DISTRIBUTION_JOB,
        {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
        {
          attempts: DEFAULT_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      expect(failedRewardJobRepository.delete).toHaveBeenCalledWith('failed-123');
      expect(result).toEqual({ jobId: 'replay-456' });
    });

    it('throws when the failed job does not exist', async () => {
      failedRewardJobRepository.findOne.mockResolvedValue(null);

      await expect(processor.replayFailedJob('non-existent')).rejects.toThrow(
        'Failed reward job non-existent not found',
      );
    });

    it('does not delete the record when re-enqueueing fails', async () => {
      failedRewardJobRepository.findOne.mockResolvedValue({
        id: 'failed-123',
        userId: 'user-123',
        taskCompletionId: 'completion-123',
        xlmAmount: 100,
      });
      rewardQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(processor.replayFailedJob('failed-123')).rejects.toThrow('Queue error');
      expect(failedRewardJobRepository.delete).not.toHaveBeenCalled();
    });
  });
});
