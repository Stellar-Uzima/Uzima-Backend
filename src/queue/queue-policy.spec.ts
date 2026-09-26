import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_JOB_ATTEMPTS,
  MAX_BACKOFF_MS,
  buildDeadLetterRecord,
  classifyFailure,
  computeBackoffDelay,
  emptyFailureCategoryCounts,
  isRetryExhausted,
} from './queue-policy';

describe('queue-policy', () => {
  describe('computeBackoffDelay', () => {
    it('doubles the delay for each successive retry', () => {
      expect(computeBackoffDelay(1)).toBe(DEFAULT_BACKOFF_MS);
      expect(computeBackoffDelay(2)).toBe(DEFAULT_BACKOFF_MS * 2);
      expect(computeBackoffDelay(3)).toBe(DEFAULT_BACKOFF_MS * 4);
    });

    it('honours a custom base delay', () => {
      expect(computeBackoffDelay(1, 250)).toBe(250);
      expect(computeBackoffDelay(2, 250)).toBe(500);
      expect(computeBackoffDelay(4, 250)).toBe(2000);
    });

    it('never exceeds the cap', () => {
      expect(computeBackoffDelay(10, 1000, 5000)).toBe(5000);
      expect(computeBackoffDelay(30, 1000, MAX_BACKOFF_MS)).toBe(MAX_BACKOFF_MS);
    });

    it('treats attempt numbers below 1 as the first retry', () => {
      expect(computeBackoffDelay(0)).toBe(DEFAULT_BACKOFF_MS);
      expect(computeBackoffDelay(-5)).toBe(DEFAULT_BACKOFF_MS);
      expect(computeBackoffDelay(1.9)).toBe(DEFAULT_BACKOFF_MS);
    });

    it('falls back to the defaults for an unusable base delay', () => {
      expect(computeBackoffDelay(1, 0)).toBe(DEFAULT_BACKOFF_MS);
      expect(computeBackoffDelay(1, Number.NaN)).toBe(DEFAULT_BACKOFF_MS);
      expect(computeBackoffDelay(1, -100)).toBe(DEFAULT_BACKOFF_MS);
    });
  });

  describe('isRetryExhausted', () => {
    it('is false while attempts remain', () => {
      expect(isRetryExhausted(0)).toBe(false);
      expect(isRetryExhausted(1)).toBe(false);
      expect(isRetryExhausted(2)).toBe(false);
    });

    it('is true once the attempt budget is spent', () => {
      expect(isRetryExhausted(3)).toBe(true);
      expect(isRetryExhausted(4)).toBe(true);
    });

    it('uses an explicit budget when provided', () => {
      expect(isRetryExhausted(2, 2)).toBe(true);
      expect(isRetryExhausted(2, 5)).toBe(false);
      expect(isRetryExhausted(0, 1)).toBe(false);
    });

    it('falls back to the default budget for an invalid maximum', () => {
      expect(isRetryExhausted(DEFAULT_JOB_ATTEMPTS, 0)).toBe(true);
      expect(isRetryExhausted(1, Number.NaN)).toBe(false);
    });
  });

  describe('classifyFailure', () => {
    it.each([
      ['Request timed out after 30000ms', 'timeout'],
      ['ETIMEDOUT connecting to redis', 'timeout'],
      ['Too many requests, retry later', 'rate-limit'],
      ['HTTP 429 from the provider', 'rate-limit'],
      ['connect ECONNREFUSED 127.0.0.1:6379', 'network'],
      ['fetch failed', 'network'],
      ['Validation failed: userId must be a uuid', 'validation'],
      ['Bad request', 'validation'],
      ['soroban contract invocation failed', 'contract'],
      ['insufficient balance for payout', 'contract'],
      ['something entirely unexpected', 'unknown'],
      ['', 'unknown'],
      [undefined, 'unknown'],
      [null, 'unknown'],
    ])('classifies %j as %s', (message, expected) => {
      expect(classifyFailure(message)).toBe(expected);
    });
  });

  describe('buildDeadLetterRecord', () => {
    it('captures the queue, job, attempts and classified reason', () => {
      const record = buildDeadLetterRecord({
        queueName: 'notification-queue',
        jobId: '42',
        jobName: 'email-notification',
        jobData: { to: 'a@b.c' },
        reason: 'connect ECONNREFUSED',
        attemptsMade: 3,
        stacktrace: ['Error: connect ECONNREFUSED', '  at send'],
        timestamp: 111,
        now: 999,
      });

      expect(record).toEqual({
        originalQueue: 'notification-queue',
        originalJobId: '42',
        originalJobName: 'email-notification',
        originalData: { to: 'a@b.c' },
        failedReason: 'connect ECONNREFUSED',
        failureCategory: 'network',
        attemptsMade: 3,
        maxAttempts: DEFAULT_JOB_ATTEMPTS,
        stacktrace: ['Error: connect ECONNREFUSED', '  at send'],
        timestamp: 111,
        failedAt: 999,
      });
    });

    it('substitutes a reason and empty stacktrace when none are available', () => {
      const record = buildDeadLetterRecord({
        queueName: 'data-processing-queue',
        jobId: '7',
        jobName: 'data-export',
        jobData: {},
        attemptsMade: 1,
        maxAttempts: 5,
        now: 123,
      });

      expect(record.failedReason).toBe('Unknown failure');
      expect(record.failureCategory).toBe('unknown');
      expect(record.maxAttempts).toBe(5);
      expect(record.stacktrace).toEqual([]);
      expect(record.failedAt).toBe(123);
    });
  });

  describe('emptyFailureCategoryCounts', () => {
    it('starts every category at zero', () => {
      const counts = emptyFailureCategoryCounts();
      expect(Object.keys(counts).sort()).toEqual(
        ['contract', 'network', 'rate-limit', 'timeout', 'unknown', 'validation'].sort(),
      );
      expect(Object.values(counts).every((value) => value === 0)).toBe(true);
    });
  });
});
