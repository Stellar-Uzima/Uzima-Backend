import { RewardProcessor } from './reward.processor';
import {
  REWARD_DEAD_LETTER_JOB,
  REWARD_DISTRIBUTION_JOB,
} from '../queue/queue.constants';
import { DEFAULT_JOB_ATTEMPTS } from '../queue/queue-policy';

describe('RewardProcessor', () => {
  const rewardService = { processRewardJob: jest.fn(), handleRewardFailure: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const rewardQueue = { add: jest.fn() };
  const dlq = { add: jest.fn() };
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

  let processor: RewardProcessor;

  const makeJob = (overrides: { attemptsMade?: number; attempts?: number } = {}) => ({
    id: 'job-123',
    data: { completionId: 'completion-123', userId: 'user-123', xlmAmount: 100 },
    attemptsMade: overrides.attemptsMade ?? 3,
    opts: { attempts: overrides.attempts ?? DEFAULT_JOB_ATTEMPTS },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new RewardProcessor(
      rewardService as any,
      eventEmitter as any,
      rewardQueue as any,
      dlq as any,
    );
    (processor as any).logger = logger;
  });

  describe('handleRewardDistribution', () => {
    it('should process reward job successfully', async () => {
      rewardService.processRewardJob.mockResolvedValue(undefined);

      await processor.handleRewardDistribution(makeJob() as any);

      expect(rewardService.processRewardJob).toHaveBeenCalledWith(
        'completion-123',
        'user-123',
        100,
      );
    });

    it('should surface a failure so Bull can retry it', async () => {
      rewardService.processRewardJob.mockRejectedValue(new Error('ledger unavailable'));

      await expect(processor.handleRewardDistribution(makeJob() as any)).rejects.toThrow(
        'ledger unavailable',
      );
    });
  });

  describe('onFailed', () => {
    it('should not dead letter a job that still has attempts left', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 1 }) as any,
        new Error('connect ECONNREFUSED 127.0.0.1:6379'),
      );

      expect(rewardService.handleRewardFailure).not.toHaveBeenCalled();
      expect(dlq.add).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should move an exhausted job to the DLQ with its classified root cause', async () => {
      dlq.add.mockResolvedValue({ id: 'dlq-456' });

      await processor.onFailed(
        makeJob() as any,
        new Error('connect ECONNREFUSED 127.0.0.1:6379'),
      );

      expect(rewardService.handleRewardFailure).toHaveBeenCalledWith('completion-123');
      expect(dlq.add).toHaveBeenCalledWith(REWARD_DEAD_LETTER_JOB, {
        userId: 'user-123',
        xlmAmount: 100,
        taskCompletionId: 'completion-123',
        errorMessage: 'connect ECONNREFUSED 127.0.0.1:6379',
        failureCategory: 'network',
        jobId: 'job-123',
        attemptsMade: 3,
        maxAttempts: DEFAULT_JOB_ATTEMPTS,
        jobType: REWARD_DISTRIBUTION_JOB,
        jobData: {
          completionId: 'completion-123',
          userId: 'user-123',
          xlmAmount: 100,
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('reward.failed', {
        userId: 'user-123',
        completionId: 'completion-123',
        error: 'connect ECONNREFUSED 127.0.0.1:6379',
      });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[network]'));
    });

    it('should use the default attempts budget when opts.attempts is undefined', async () => {
      dlq.add.mockResolvedValue({ id: 'dlq-456' });

      await processor.onFailed(
        {
          id: 'job-123',
          data: { completionId: 'completion-123', userId: 'user-123', xlmAmount: 100 },
          attemptsMade: DEFAULT_JOB_ATTEMPTS,
          opts: {},
        } as any,
        new Error('Request timed out'),
      );

      expect(rewardService.handleRewardFailure).toHaveBeenCalled();
      const [, payload] = dlq.add.mock.calls[0];
      expect(payload).toMatchObject({
        maxAttempts: DEFAULT_JOB_ATTEMPTS,
        failureCategory: 'timeout',
      });
    });

    it('should honour a per-job budget larger than the default', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 3, attempts: 5 }) as any,
        new Error('boom'),
      );

      expect(dlq.add).not.toHaveBeenCalled();
    });
  });
});
