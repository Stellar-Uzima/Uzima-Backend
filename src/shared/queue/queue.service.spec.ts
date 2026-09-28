import { QueueService } from './queue.service';
import {
  REWARD_QUEUE,
  NOTIFICATION_QUEUE,
  TASK_VERIFICATION_QUEUE,
  PROOF_VERIFICATION_QUEUE,
  USER_ACTIVITY_QUEUE,
  DATA_PROCESSING_QUEUE,
  REWARD_DEAD_LETTER_QUEUE,
  BULK_TASK_ASSIGNMENT_JOB,
} from '../../queue/queue.constants';
import { DEFAULT_BACKOFF_MS, DEFAULT_JOB_ATTEMPTS } from '../../queue/queue-policy';

describe('QueueService', () => {
  let queueService: QueueService;
  let queues: Record<string, any>;
  let deadLetterQueue: any;

  const makeMockQueue = () => ({
    add: jest.fn(),
    getJob: jest.fn(),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getPaused: jest.fn().mockResolvedValue([]),
    getJobs: jest.fn().mockResolvedValue([]),
    pause: jest.fn(),
    resume: jest.fn(),
    clean: jest.fn(),
  });

  beforeEach(() => {
    deadLetterQueue = makeMockQueue();
    queues = {
      [REWARD_QUEUE]: makeMockQueue(),
      [NOTIFICATION_QUEUE]: makeMockQueue(),
      [TASK_VERIFICATION_QUEUE]: makeMockQueue(),
      [PROOF_VERIFICATION_QUEUE]: makeMockQueue(),
      [USER_ACTIVITY_QUEUE]: makeMockQueue(),
      [DATA_PROCESSING_QUEUE]: makeMockQueue(),
      [REWARD_DEAD_LETTER_QUEUE]: deadLetterQueue,
    };

    // @ts-ignore - constructor injection in tests
    queueService = new QueueService(
      queues[REWARD_QUEUE],
      queues[NOTIFICATION_QUEUE],
      queues[TASK_VERIFICATION_QUEUE],
      queues[PROOF_VERIFICATION_QUEUE],
      queues[USER_ACTIVITY_QUEUE],
      queues[DATA_PROCESSING_QUEUE],
      deadLetterQueue,
    );
  });

  it('enqueues bulk task assignment on the data processing queue', async () => {
    const mockQueue = queues[DATA_PROCESSING_QUEUE];
    mockQueue.add.mockResolvedValue({ id: 'bulk-1' });

    const job = await queueService.enqueueBulkTaskAssignment({
      userIds: ['user-1'],
      taskIds: ['task-1'],
      assignedDate: '2026-06-01',
    });

    expect(mockQueue.add).toHaveBeenCalledWith(
      BULK_TASK_ASSIGNMENT_JOB,
      {
        userIds: ['user-1'],
        taskIds: ['task-1'],
        assignedDate: '2026-06-01',
      },
      expect.any(Object),
    );
    expect(job).toEqual({ id: 'bulk-1' });
  });

  it('passes maxRetries and backoffMs through to bull add', async () => {
    const mockQueue = queues[NOTIFICATION_QUEUE];
    mockQueue.add.mockResolvedValue({ id: '1' });

    const job = await queueService.addJob(
      NOTIFICATION_QUEUE,
      'reminder',
      { foo: 'bar' },
      { maxRetries: 5, backoffMs: 2000 },
    );

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    const [[name, data, opts]] = mockQueue.add.mock.calls;
    expect(name).toBe('reminder');
    expect(data).toEqual({ foo: 'bar' });
    expect(opts.attempts).toBe(5);
    expect(opts.backoff).toBeDefined();
    expect(opts.backoff.type).toBe('exponential');
    expect(opts.backoff.delay).toBe(2000);
    expect(job).toEqual({ id: '1' });
  });

  it('falls back to the shared retry policy when no options are given', async () => {
    const mockQueue = queues[NOTIFICATION_QUEUE];
    mockQueue.add.mockResolvedValue({ id: 'n1' });

    await queueService.addJob(NOTIFICATION_QUEUE, 'reminder', {});

    const [, , opts] = mockQueue.add.mock.calls[0];
    expect(opts.attempts).toBe(DEFAULT_JOB_ATTEMPTS);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: DEFAULT_BACKOFF_MS });
  });

  it('records a classified root cause when moving a job to the dead letter queue', async () => {
    const job = {
      id: 'job-9',
      name: 'data-export',
      data: { userId: 'u1' },
      failedReason: 'connect ECONNREFUSED 127.0.0.1:6379',
      attemptsMade: 3,
      opts: { attempts: 3 },
      stacktrace: ['Error: connect ECONNREFUSED'],
      timestamp: 111,
      remove: jest.fn().mockResolvedValue(undefined),
    };
    queues[DATA_PROCESSING_QUEUE].getJob.mockResolvedValue(job);
    deadLetterQueue.add.mockResolvedValue({ id: 'dl-1' });

    await queueService.moveToDeadLetter(DATA_PROCESSING_QUEUE, 'job-9');

    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
    const [name, record] = deadLetterQueue.add.mock.calls[0];
    expect(name).toBe('failed-job');
    expect(record).toMatchObject({
      originalQueue: DATA_PROCESSING_QUEUE,
      originalJobId: 'job-9',
      originalJobName: 'data-export',
      failedReason: 'connect ECONNREFUSED 127.0.0.1:6379',
      failureCategory: 'network',
      attemptsMade: 3,
      maxAttempts: 3,
      stacktrace: ['Error: connect ECONNREFUSED'],
    });
    expect(job.remove).toHaveBeenCalledTimes(1);
  });

  it('reaps only the jobs that have exhausted their attempts', async () => {
    const exhausted = {
      id: 'e1',
      name: 'email-notification',
      data: {},
      failedReason: 'Request timed out',
      attemptsMade: 3,
      opts: { attempts: 3 },
      stacktrace: [],
      timestamp: 1,
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const retrying = {
      id: 'r1',
      name: 'email-notification',
      data: {},
      failedReason: 'Request timed out',
      attemptsMade: 1,
      opts: { attempts: 3 },
      stacktrace: [],
      timestamp: 1,
      remove: jest.fn().mockResolvedValue(undefined),
    };
    queues[NOTIFICATION_QUEUE].getFailed.mockResolvedValue([exhausted, retrying]);
    queues[NOTIFICATION_QUEUE].getJob.mockResolvedValue(exhausted);
    deadLetterQueue.add.mockResolvedValue({ id: 'dl' });

    const result = await queueService.reapExhaustedJobs(NOTIFICATION_QUEUE);

    expect(result).toEqual({ inspected: 2, moved: ['e1'] });
    expect(queues[NOTIFICATION_QUEUE].getJob).toHaveBeenCalledTimes(1);
    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
  });

  it('groups exhausted and retrying failures by root cause', async () => {
    queues[REWARD_QUEUE].getFailed.mockResolvedValue([
      {
        id: 1,
        name: 'reward-distribution',
        failedReason: 'Request timed out',
        attemptsMade: 3,
        opts: { attempts: 3 },
        stacktrace: ['Error: Request timed out'],
        finishedOn: 10,
      },
      {
        id: 2,
        name: 'reward-distribution',
        failedReason: 'ETIMEDOUT while calling Stellar',
        attemptsMade: 3,
        opts: { attempts: 3 },
        stacktrace: [],
        finishedOn: 11,
      },
      {
        id: '3',
        name: 'reward-distribution',
        failedReason: 'insufficient balance',
        attemptsMade: 1,
        opts: { attempts: 3 },
        stacktrace: [],
        finishedOn: 12,
      },
      {
        id: '4',
        name: 'reward-distribution',
        failedReason: undefined,
        attemptsMade: 2,
        opts: undefined,
        stacktrace: undefined,
        finishedOn: undefined,
      },
    ]);

    const report = await queueService.getFailureReport(REWARD_QUEUE);

    expect(queues[REWARD_QUEUE].getFailed).toHaveBeenCalledWith(0, 500);
    expect(report.queue).toBe(REWARD_QUEUE);
    expect(report.total).toBe(4);
    expect(report.exhausted).toBe(2);
    expect(report.retrying).toBe(2);
    expect(report.byCategory).toMatchObject({ timeout: 2, contract: 1, unknown: 1 });
    expect(report.records[0]).toMatchObject({
      id: '1',
      failureCategory: 'timeout',
      exhausted: true,
      failedAt: 10,
      stacktrace: ['Error: Request timed out'],
    });
    expect(report.records[3]).toMatchObject({
      id: '4',
      failedReason: 'Unknown failure',
      maxAttempts: DEFAULT_JOB_ATTEMPTS,
      exhausted: false,
      stacktrace: [],
    });
  });
});
