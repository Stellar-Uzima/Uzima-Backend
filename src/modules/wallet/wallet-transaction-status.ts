import { BadRequestException } from '@nestjs/common';
import { WalletTransactionStatus } from '../../database/entities/wallet-transaction.entity';

/**
 * Legal wallet transaction status transitions.
 *
 * Lifecycle rules:
 * - PENDING settles to COMPLETED (or FAILED on settlement failure) or is
 *   CANCELLED by the owner before settlement.
 * - COMPLETED (and the legacy CONFIRMED alias) can only move to REVERSED via
 *   the compensating-entry reversal workflow.
 * - FAILED, CANCELLED and REVERSED are terminal. A FAILED transaction must
 *   never be mutated to COMPLETED; money movement requires a new transaction.
 * - REVERSED has no outgoing transitions: a transaction can be reversed at
 *   most once.
 */
export const WALLET_TRANSACTION_STATUS_TRANSITIONS: Record<
  WalletTransactionStatus,
  readonly WalletTransactionStatus[]
> = {
  [WalletTransactionStatus.PENDING]: [
    WalletTransactionStatus.COMPLETED,
    WalletTransactionStatus.FAILED,
    WalletTransactionStatus.CANCELLED,
  ],
  [WalletTransactionStatus.CONFIRMED]: [
    WalletTransactionStatus.COMPLETED,
    WalletTransactionStatus.REVERSED,
  ],
  [WalletTransactionStatus.COMPLETED]: [WalletTransactionStatus.REVERSED],
  [WalletTransactionStatus.FAILED]: [],
  [WalletTransactionStatus.CANCELLED]: [],
  [WalletTransactionStatus.REVERSED]: [],
};

/**
 * Returns true when `from -> to` is a documented, legal status transition.
 */
export function isValidStatusTransition(
  from: WalletTransactionStatus,
  to: WalletTransactionStatus,
): boolean {
  const allowed = WALLET_TRANSACTION_STATUS_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Throws BadRequestException when `from -> to` is not a legal status
 * transition. Message includes both statuses so callers get an actionable 400.
 */
export function assertValidStatusTransition(
  from: WalletTransactionStatus,
  to: WalletTransactionStatus,
): void {
  if (!isValidStatusTransition(from, to)) {
    throw new BadRequestException(
      `Invalid wallet transaction status transition: ${from} -> ${to}`,
    );
  }
}
