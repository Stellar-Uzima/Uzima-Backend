import { EntityManager } from 'typeorm';
import {
  WalletLedgerEntry,
  WalletLedgerDirection,
  WalletLedgerEntryType,
} from '../entities/wallet-ledger-entry.entity';

export interface LedgerEntryInput {
  userId: string;
  direction: WalletLedgerDirection;
  amount: number;
  type: WalletLedgerEntryType;
  referenceType?: string | null;
  referenceId?: string | null;
  balanceAfter?: number | null;
}

/** Rounds a money amount to the ledger's 7 decimal places. */
export function toLedgerAmount(value: number): number {
  return parseFloat(value.toFixed(7));
}

/**
 * Appends one ledger row using the caller's transaction manager, so the entry
 * commits or rolls back together with the balance change it describes.
 */
export async function recordLedgerEntry(
  manager: EntityManager,
  input: LedgerEntryInput,
): Promise<WalletLedgerEntry> {
  const repository = manager.getRepository(WalletLedgerEntry);
  const entry = repository.create({
    ...input,
    amount: toLedgerAmount(input.amount),
    balanceAfter:
      input.balanceAfter == null ? null : toLedgerAmount(input.balanceAfter),
  });
  return repository.save(entry);
}
