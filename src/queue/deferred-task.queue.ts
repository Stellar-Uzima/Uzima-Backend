import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_JOB_ATTEMPTS,
  FailureCategory,
  MAX_BACKOFF_MS,
  classifyFailure,
  computeBackoffDelay,
} from './queue-policy';

/**
 * Minimal async job queue for deferring non-critical work off the request path.
 * Addresses: accept jobs asynchronously, retry/dead-letter policy, inspectable status.
 */
export interface QueuedJob {
  id: string;
  attempts: number;
  status: 'pending' | 'completed' | 'dead-letter';
  /** Total attempts this job is allowed, captured at enqueue time. */
  maxAttempts: number;
  /** Message from the most recent failed attempt, if any. */
  lastError?: string;
  /** Classification of {@link lastError}, so dead letters can be grouped by cause. */
  failureCategory?: FailureCategory;
  /** Epoch ms of the scheduled next attempt while the job is backing off. */
  nextRetryAt?: number;
  /** Epoch ms the job reached a terminal state (`completed` / `dead-letter`). */
  finishedAt?: number;
}

export interface DeferredTaskQueueOptions {
  /** Attempts per job, including the first. Defaults to the shared policy value. */
  maxAttempts?: number;
  /** Base delay for exponential backoff, in ms. */
  baseBackoffMs?: number;
  /** Upper bound for a single backoff delay, in ms. */
  maxBackoffMs?: number;
  /**
   * Injectable sleeper. Tests pass a recorder so the retry schedule can be
   * asserted without actually waiting; production uses `setTimeout`.
   */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  ms > 0
    ? new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      })
    : Promise.resolve();

export class DeferredTaskQueue {
  private readonly jobs = new Map<string, QueuedJob>();
  private readonly deadLetters = new Map<string, QueuedJob>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: DeferredTaskQueueOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_JOB_ATTEMPTS;
    this.baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  enqueue(id: string, task: () => Promise<void>): void {
    const job: QueuedJob = {
      id,
      attempts: 0,
      status: 'pending',
      maxAttempts: this.maxAttempts,
    };
    this.jobs.set(id, job);

    const run = this.run(job, task).catch(() => undefined);
    this.inFlight.add(run);
    void run.then(() => {
      this.inFlight.delete(run);
    });
  }

  private async run(job: QueuedJob, task: () => Promise<void>): Promise<void> {
    while (job.attempts < job.maxAttempts) {
      job.attempts += 1;
      try {
        await task();
        job.status = 'completed';
        job.finishedAt = Date.now();
        job.nextRetryAt = undefined;
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        job.lastError = message;
        job.failureCategory = classifyFailure(message);

        if (job.attempts >= job.maxAttempts) {
          job.status = 'dead-letter';
          job.finishedAt = Date.now();
          job.nextRetryAt = undefined;
          this.deadLetters.set(job.id, job);
          return;
        }

        const delay = computeBackoffDelay(
          job.attempts,
          this.baseBackoffMs,
          this.maxBackoffMs,
        );
        job.nextRetryAt = Date.now() + delay;
        await this.sleep(delay);
      }
    }
  }

  /** Waits for every in-flight job to reach a terminal state. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all(Array.from(this.inFlight));
    }
  }

  getStatus(id: string): QueuedJob | undefined {
    return this.jobs.get(id);
  }

  listAll(): QueuedJob[] {
    return Array.from(this.jobs.values());
  }

  /** Jobs that exhausted every attempt, retained with their last error. */
  getDeadLetters(): QueuedJob[] {
    return Array.from(this.deadLetters.values());
  }
}
