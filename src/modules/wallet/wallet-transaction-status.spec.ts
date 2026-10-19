import { BadRequestException } from '@nestjs/common';
import { WalletTransactionStatus } from '../../database/entities/wallet-transaction.entity';
import {
  assertValidStatusTransition,
  isValidStatusTransition,
} from './wallet-transaction-status';
import {
  assertValidWalletAmount,
  isValidWalletAmountPrecision,
} from './wallet-amount.util';

describe('wallet transaction status transitions', () => {
  it('allows PENDING to settle to COMPLETED, FAILED or CANCELLED', () => {
    expect(isValidStatusTransition(WalletTransactionStatus.PENDING, WalletTransactionStatus.COMPLETED)).toBe(true);
    expect(isValidStatusTransition(WalletTransactionStatus.PENDING, WalletTransactionStatus.FAILED)).toBe(true);
    expect(isValidStatusTransition(WalletTransactionStatus.PENDING, WalletTransactionStatus.CANCELLED)).toBe(true);
  });

  it('allows COMPLETED (and legacy CONFIRMED) to be reversed only', () => {
    expect(isValidStatusTransition(WalletTransactionStatus.COMPLETED, WalletTransactionStatus.REVERSED)).toBe(true);
    expect(isValidStatusTransition(WalletTransactionStatus.CONFIRMED, WalletTransactionStatus.REVERSED)).toBe(true);
    expect(isValidStatusTransition(WalletTransactionStatus.COMPLETED, WalletTransactionStatus.FAILED)).toBe(false);
  });

  it('treats FAILED, CANCELLED and REVERSED as terminal', () => {
    const terminal = [
      WalletTransactionStatus.FAILED,
      WalletTransactionStatus.CANCELLED,
      WalletTransactionStatus.REVERSED,
    ];
    for (const from of terminal) {
      for (const to of Object.values(WalletTransactionStatus)) {
        expect(isValidStatusTransition(from, to)).toBe(false);
      }
    }
  });

  it('never allows FAILED to become COMPLETED', () => {
    expect(isValidStatusTransition(WalletTransactionStatus.FAILED, WalletTransactionStatus.COMPLETED)).toBe(false);
    expect(() =>
      assertValidStatusTransition(WalletTransactionStatus.FAILED, WalletTransactionStatus.COMPLETED),
    ).toThrow(BadRequestException);
  });

  it('throws an actionable 400 naming both statuses', () => {
    expect(() =>
      assertValidStatusTransition(WalletTransactionStatus.REVERSED, WalletTransactionStatus.COMPLETED),
    ).toThrow('Invalid wallet transaction status transition: REVERSED -> COMPLETED');
  });
});

describe('wallet amount precision', () => {
  it('accepts values with up to 7 decimal places', () => {
    expect(isValidWalletAmountPrecision(1.1234567)).toBe(true);
    expect(isValidWalletAmountPrecision(100)).toBe(true);
    expect(() => assertValidWalletAmount(0.0000001)).not.toThrow();
  });

  it('rejects excessive precision', () => {
    expect(isValidWalletAmountPrecision(1.12345678)).toBe(false);
    expect(() => assertValidWalletAmount(1.12345678)).toThrow(
      'Amount must have at most 7 decimal places',
    );
  });

  it('rejects zero and negative amounts by default', () => {
    expect(() => assertValidWalletAmount(0)).toThrow('Amount must be greater than zero');
    expect(() => assertValidWalletAmount(-1)).toThrow('Amount must not be negative');
  });

  it('allows signed amounts when explicitly requested (ledger debits)', () => {
    expect(() => assertValidWalletAmount(-5.5, { allowNegative: true })).not.toThrow();
  });

  it('rejects non-finite values and out-of-range magnitudes', () => {
    expect(() => assertValidWalletAmount(Number.NaN)).toThrow('Amount must be a valid number');
    expect(() => assertValidWalletAmount(Number.POSITIVE_INFINITY)).toThrow('Amount must be a valid number');
    expect(() => assertValidWalletAmount(1e12)).toThrow('Amount must not exceed');
  });
});
