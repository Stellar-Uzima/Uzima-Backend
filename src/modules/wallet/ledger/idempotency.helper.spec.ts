import { ConflictException } from '@nestjs/common';
import { WalletIdempotencyKey } from '../entities/wallet-idempotency-key.entity';
import {
  canonicalizeSnapshot,
  resolveStoredResult,
} from './idempotency.helper';

describe('canonicalizeSnapshot', () => {
  it('produces the same string regardless of key order', () => {
    expect(canonicalizeSnapshot({ amount: 1, recipientId: 'u2' })).toBe(
      canonicalizeSnapshot({ recipientId: 'u2', amount: 1 }),
    );
  });

  it('normalizes nested objects as well', () => {
    expect(canonicalizeSnapshot({ inner: { a: 1, b: 2 } })).toBe(
      canonicalizeSnapshot({ inner: { b: 2, a: 1 } }),
    );
  });

  it('distinguishes different payloads', () => {
    expect(canonicalizeSnapshot({ amount: 1 })).not.toBe(
      canonicalizeSnapshot({ amount: 2 }),
    );
  });
});

describe('resolveStoredResult', () => {
  const buildKey = (
    overrides: Partial<WalletIdempotencyKey> = {},
  ): WalletIdempotencyKey => ({
    id: 'key-row-1',
    endpoint: 'wallet.transfer',
    userId: 'user-1',
    idempotencyKey: 'retry-1',
    requestId: 'req-1',
    requestSnapshot: { amount: 1, memo: null, recipientId: 'user-2' },
    responseSnapshot: { transactionId: 'tx-1' },
    transactionId: 'tx-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  it('replays the stored response for a matching retry', () => {
    const result = resolveStoredResult<Record<string, unknown>>(
      buildKey(),
      { recipientId: 'user-2', amount: 1, memo: null },
      'transfer',
    );
    expect(result).toEqual({ transactionId: 'tx-1' });
  });

  it('rejects a key reused with different input', () => {
    expect(() =>
      resolveStoredResult(
        buildKey(),
        { recipientId: 'user-3', amount: 1, memo: null },
        'transfer',
      ),
    ).toThrow(ConflictException);
  });

  it('rejects while the original response is missing', () => {
    expect(() =>
      resolveStoredResult(
        buildKey({ responseSnapshot: null, transactionId: null }),
        { recipientId: 'user-2', amount: 1, memo: null },
        'transfer',
      ),
    ).toThrow(ConflictException);
  });
});
