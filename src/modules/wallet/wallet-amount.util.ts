import { BadRequestException } from '@nestjs/common';

/**
 * XLM amounts are stored as decimal(18,7) — at most 7 fractional digits
 * (stroops precision) and at most 11 integral digits.
 */
export const MAX_WALLET_AMOUNT_DECIMAL_PLACES = 7;
export const MAX_WALLET_AMOUNT = 99_999_999_999.9999999;

/**
 * Decimal-safe check: the value must be a finite number that survives
 * rounding to 7 decimal places unchanged (no silent rounding/truncation).
 */
export function isValidWalletAmountPrecision(amount: number): boolean {
  return (
    Number.isFinite(amount) &&
    amount === parseFloat(amount.toFixed(MAX_WALLET_AMOUNT_DECIMAL_PLACES))
  );
}

/**
 * Validates a wallet amount and throws an actionable 400 on failure.
 *
 * Rejects NaN/Infinity, zero/negative values (unless explicitly allowed),
 * excessive precision (> 7 decimal places) and out-of-range magnitudes.
 */
export function assertValidWalletAmount(
  amount: number,
  options: { allowNegative?: boolean; allowZero?: boolean } = {},
): void {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount)) {
    throw new BadRequestException('Amount must be a valid number');
  }
  if (!options.allowZero && amount === 0) {
    throw new BadRequestException('Amount must be greater than zero');
  }
  if (amount < 0 && !options.allowNegative) {
    throw new BadRequestException('Amount must not be negative');
  }
  if (!isValidWalletAmountPrecision(amount)) {
    throw new BadRequestException(
      `Amount must have at most ${MAX_WALLET_AMOUNT_DECIMAL_PLACES} decimal places`,
    );
  }
  const magnitude = Math.abs(amount);
  if (magnitude > MAX_WALLET_AMOUNT) {
    throw new BadRequestException(
      `Amount must not exceed ${MAX_WALLET_AMOUNT} XLM`,
    );
  }
}
