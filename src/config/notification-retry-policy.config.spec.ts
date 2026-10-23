import { NotificationRetryPolicy } from './notification-retry-policy.config';
import policyFactory from './notification-retry-policy.config';
import { isPermanentProviderError } from '../modules/notification-center/provider-error-classifier';

describe('notification retry policy', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('exposes configurable retry count, delay and terminal strategy', () => {
    process.env.NOTIFICATION_RETRY_MAX_ATTEMPTS = '7';
    process.env.NOTIFICATION_RETRY_BASE_DELAY_MS = '250';
    process.env.NOTIFICATION_RETRY_TERMINAL_FAILURE_STRATEGY = 'silent';

    const policy = policyFactory() as NotificationRetryPolicy;

    expect(policy.maxAttempts).toBe(7);
    expect(policy.baseDelayMs).toBe(250);
    expect(policy.terminalFailureStrategy).toBe('silent');
  });

  it('falls back to safe defaults when unset', () => {
    delete process.env.NOTIFICATION_RETRY_MAX_ATTEMPTS;
    delete process.env.NOTIFICATION_RETRY_BASE_DELAY_MS;
    delete process.env.NOTIFICATION_RETRY_TERMINAL_FAILURE_STRATEGY;

    const policy = policyFactory() as NotificationRetryPolicy;

    expect(policy.maxAttempts).toBe(3);
    expect(policy.baseDelayMs).toBe(1000);
    expect(policy.terminalFailureStrategy).toBe('escalate');
  });
});

describe('isPermanentProviderError', () => {
  it('treats 4xx provider errors as permanent', () => {
    expect(isPermanentProviderError({ statusCode: 400, message: 'bad' })).toBe(true);
    expect(isPermanentProviderError({ status: 404, message: 'missing' })).toBe(true);
  });

  it('treats 5xx provider errors as transient', () => {
    expect(isPermanentProviderError({ status: 503, message: 'unavailable' })).toBe(false);
    expect(isPermanentProviderError({ status: 500, message: 'boom' })).toBe(false);
  });

  it('treats network errors as transient', () => {
    expect(isPermanentProviderError({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isPermanentProviderError({ code: 'ECONNRESET' })).toBe(false);
  });

  it('never retries a circuit-open signal as permanent', () => {
    expect(isPermanentProviderError({ code: 'NOTIFICATION_CIRCUIT_OPEN' })).toBe(false);
  });

  it('flags known permanent provider codes', () => {
    expect(isPermanentProviderError({ code: 'UNAUTHENTICATED' })).toBe(true);
    expect(isPermanentProviderError({ code: 'INVALID_ARGUMENT' })).toBe(true);
  });

  it('flags FCM unregistered tokens as permanent', () => {
    expect(
      isPermanentProviderError({ message: 'Requested entity was not found (UNREGISTERED)' }),
    ).toBe(true);
  });

  it('flags missing provider configuration as permanent', () => {
    expect(isPermanentProviderError({ message: 'Twilio SMS is not configured' })).toBe(true);
  });

  it('defaults unknown errors to transient', () => {
    expect(isPermanentProviderError(new Error('something odd'))).toBe(false);
    expect(isPermanentProviderError(null)).toBe(false);
  });
});
