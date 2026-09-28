import { Counter, Histogram, register } from 'prom-client';

/**
 * Standalone queue/background-job metrics, grouped by queue and job name.
 * Complements MetricsService's HTTP/DB metrics for #1324 (APM coverage of
 * background jobs, not just request/response paths).
 */
const queueJobsProcessedTotal = new Counter({
  name: 'queue_jobs_processed_total',
  help: 'Total number of queue jobs processed, grouped by queue and job name',
  labelNames: ['queue', 'job', 'status'],
  registers: [register],
});

const queueJobDurationSeconds = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Queue job processing duration in seconds, grouped by queue and job name',
  labelNames: ['queue', 'job'],
  registers: [register],
});

export function recordQueueJobProcessed(
  queue: string,
  job: string,
  status: 'success' | 'failed',
  durationSeconds: number,
) {
  queueJobsProcessedTotal.inc({ queue, job, status });
  queueJobDurationSeconds.observe({ queue, job }, durationSeconds);
}
