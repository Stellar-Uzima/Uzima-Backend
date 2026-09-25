/**
 * Minimal async job queue for deferring non-critical work off the request path.
 * Addresses: accept jobs asynchronously, retry/dead-letter policy, inspectable status.
 */
export interface QueuedJob {
  id: string;
  attempts: number;
  status: 'pending' | 'completed' | 'dead-letter';
}

const MAX_ATTEMPTS = 3;

export class DeferredTaskQueue {
  private readonly jobs = new Map<string, QueuedJob>();

  enqueue(id: string, task: () => Promise<void>): void {
    const job: QueuedJob = { id, attempts: 0, status: 'pending' };
    this.jobs.set(id, job);
    void this.run(job, task);
  }

  private async run(job: QueuedJob, task: () => Promise<void>): Promise<void> {
    while (job.attempts < MAX_ATTEMPTS) {
      job.attempts += 1;
      try {
        await task();
        job.status = 'completed';
        return;
      } catch {
        if (job.attempts >= MAX_ATTEMPTS) {
          job.status = 'dead-letter';
        }
      }
    }
  }

  getStatus(id: string): QueuedJob | undefined {
    return this.jobs.get(id);
  }

  listAll(): QueuedJob[] {
    return Array.from(this.jobs.values());
  }
}
