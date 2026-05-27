import { QueueService } from './queue.service';
import { REWARD_QUEUE, NOTIFICATION_QUEUE, TASK_VERIFICATION_QUEUE, PROOF_VERIFICATION_QUEUE, USER_ACTIVITY_QUEUE, DATA_PROCESSING_QUEUE, REWARD_DEAD_LETTER_QUEUE } from '../../queue/queue.constants';

describe('QueueService', () => {
  let queueService: QueueService;
  const makeMockQueue = () => ({ add: jest.fn(), getJob: jest.fn(), getWaiting: jest.fn(), getActive: jest.fn(), getCompleted: jest.fn(), getFailed: jest.fn(), getDelayed: jest.fn(), getPaused: jest.fn(), pause: jest.fn(), resume: jest.fn(), clean: jest.fn() });

  beforeEach(() => {
    const rewardQueue = makeMockQueue();
    const notificationQueue = makeMockQueue();
    const taskVerificationQueue = makeMockQueue();
    const proofVerificationQueue = makeMockQueue();
    const userActivityQueue = makeMockQueue();
    const dataProcessingQueue = makeMockQueue();
    const deadLetterQueue = makeMockQueue();

    // @ts-ignore - constructor injection in tests
    queueService = new QueueService(
      rewardQueue,
      notificationQueue,
      taskVerificationQueue,
      proofVerificationQueue,
      userActivityQueue,
      dataProcessingQueue,
      deadLetterQueue,
    );
  });

  it('passes maxRetries and backoffMs through to bull add', async () => {
    const mockQueue = (queueService as any).queues.get(NOTIFICATION_QUEUE);
    mockQueue.add.mockResolvedValue({ id: '1' });

    const job = await queueService.addJob(NOTIFICATION_QUEUE, 'reminder', { foo: 'bar' }, { maxRetries: 5, backoffMs: 2000 });

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
});
