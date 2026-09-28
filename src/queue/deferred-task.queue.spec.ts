import { DeferredTaskQueue } from './deferred-task.queue';

describe('DeferredTaskQueue', () => {
  const makeSleep = () => {
    const delays: number[] = [];
    const sleep = jest.fn(async (ms: number) => {
      delays.push(ms);
    });
    return { sleep, delays };
  };

  it('runs a task once and marks it completed', async () => {
    const queue = new DeferredTaskQueue();
    const task = jest.fn().mockResolvedValue(undefined);

    queue.enqueue('job-1', task);
    await queue.drain();

    expect(task).toHaveBeenCalledTimes(1);
    expect(queue.getStatus('job-1')).toMatchObject({ status: 'completed', attempts: 1 });
    expect(queue.getDeadLetters()).toEqual([]);
  });

  it('retries with exponential backoff and recovers', async () => {
    const { sleep, delays } = makeSleep();
    const queue = new DeferredTaskQueue({ baseBackoffMs: 100, sleep });
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue(undefined);

    queue.enqueue('job-2', task);
    await queue.drain();

    expect(task).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
    expect(queue.getStatus('job-2')).toMatchObject({ status: 'completed', attempts: 3 });
  });

  it('dead-letters a job once every attempt is spent', async () => {
    const { sleep, delays } = makeSleep();
    const queue = new DeferredTaskQueue({ maxAttempts: 3, baseBackoffMs: 50, sleep });
    const task = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    queue.enqueue('job-3', task);
    await queue.drain();

    expect(task).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([50, 100]);

    const job = queue.getStatus('job-3');
    expect(job).toMatchObject({
      status: 'dead-letter',
      attempts: 3,
      maxAttempts: 3,
      failureCategory: 'network',
      lastError: 'connect ECONNREFUSED 127.0.0.1:6379',
    });
    expect(job?.finishedAt).toEqual(expect.any(Number));
    expect(job?.nextRetryAt).toBeUndefined();
    expect(queue.getDeadLetters().map((entry) => entry.id)).toEqual(['job-3']);
  });

  it('classifies a timeout failure on the dead letter', async () => {
    const { sleep } = makeSleep();
    const queue = new DeferredTaskQueue({ maxAttempts: 1, sleep });

    queue.enqueue('job-4', jest.fn().mockRejectedValue(new Error('Request timed out')));
    await queue.drain();

    expect(queue.getDeadLetters()[0]).toMatchObject({
      id: 'job-4',
      failureCategory: 'timeout',
      attempts: 1,
    });
  });

  it('does not back off when only one attempt is allowed', async () => {
    const { sleep, delays } = makeSleep();
    const queue = new DeferredTaskQueue({ maxAttempts: 1, sleep });
    const task = jest.fn().mockRejectedValue(new Error('nope'));

    queue.enqueue('single', task);
    await queue.drain();

    expect(task).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
    expect(queue.getDeadLetters()).toHaveLength(1);
  });

  it('dead-letters only the jobs that exhausted their attempts', async () => {
    const { sleep } = makeSleep();
    const queue = new DeferredTaskQueue({ maxAttempts: 2, sleep });

    queue.enqueue('ok', jest.fn().mockResolvedValue(undefined));
    queue.enqueue('bad', jest.fn().mockRejectedValue(new Error('boom')));
    await queue.drain();

    expect(queue.getDeadLetters().map((entry) => entry.id)).toEqual(['bad']);
    expect(
      queue
        .listAll()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['bad', 'ok']);
  });

  it('drain resolves once in-flight work settles', async () => {
    const queue = new DeferredTaskQueue();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    queue.enqueue('slow', () => gate);
    let drained = false;
    const drainPromise = queue.drain().then(() => {
      drained = true;
    });

    expect(drained).toBe(false);
    release();
    await drainPromise;

    expect(drained).toBe(true);
    expect(queue.getStatus('slow')?.status).toBe('completed');
  });
});
