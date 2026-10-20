import { EntityManager } from 'typeorm';
import {
  WalletLedgerDirection,
  WalletLedgerEntry,
  WalletLedgerEntryType,
} from '../entities/wallet-ledger-entry.entity';
import { recordLedgerEntry, toLedgerAmount } from './wallet-ledger.helper';

describe('toLedgerAmount', () => {
  it('rounds to the ledger precision of 7 decimal places', () => {
    expect(toLedgerAmount(1.123456789)).toBe(1.1234568);
    expect(toLedgerAmount(10)).toBe(10);
  });
});

describe('recordLedgerEntry', () => {
  it('inserts an append-only entry through the provided manager', async () => {
    const saved: WalletLedgerEntry[] = [];
    const repository = {
      create: jest.fn((input: Partial<WalletLedgerEntry>) => input as WalletLedgerEntry),
      save: jest.fn(async (entry: WalletLedgerEntry) => {
        saved.push(entry);
        return entry;
      }),
    };
    const manager = {
      getRepository: jest.fn(() => repository),
    } as unknown as EntityManager;

    const entry = await recordLedgerEntry(manager, {
      userId: 'user-1',
      direction: WalletLedgerDirection.DEBIT,
      amount: 1.123456789,
      type: WalletLedgerEntryType.TRANSFER_OUT,
      referenceType: 'wallet_transaction',
      referenceId: 'tx-1',
      balanceAfter: 8.765432111,
    });

    expect(manager.getRepository).toHaveBeenCalledWith(WalletLedgerEntry);
    expect(repository.create).toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
    expect(entry.amount).toBe(1.1234568);
    expect(entry.balanceAfter).toBe(8.7654321);
    expect(entry.direction).toBe(WalletLedgerDirection.DEBIT);
    expect(entry.type).toBe(WalletLedgerEntryType.TRANSFER_OUT);
  });

  it('keeps a null balanceAfter null', async () => {
    const repository = {
      create: jest.fn((input: Partial<WalletLedgerEntry>) => input as WalletLedgerEntry),
      save: jest.fn(async (entry: WalletLedgerEntry) => entry),
    };
    const manager = {
      getRepository: jest.fn(() => repository),
    } as unknown as EntityManager;

    const entry = await recordLedgerEntry(manager, {
      userId: 'user-1',
      direction: WalletLedgerDirection.CREDIT,
      amount: 2,
      type: WalletLedgerEntryType.REWARD,
    });

    expect(entry.balanceAfter).toBeNull();
    expect(entry.referenceId).toBeUndefined();
  });
});
