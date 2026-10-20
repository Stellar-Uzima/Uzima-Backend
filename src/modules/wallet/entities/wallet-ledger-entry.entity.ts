import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum WalletLedgerDirection {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum WalletLedgerEntryType {
  TOPUP = 'topup',
  WITHDRAWAL = 'withdrawal',
  TRANSFER_OUT = 'transfer_out',
  TRANSFER_IN = 'transfer_in',
  REWARD = 'reward',
  REVERSAL = 'reversal',
}

/**
 * Append-only record of a single wallet balance change.
 *
 * Rows are only ever inserted: the application exposes no update or delete
 * path for the ledger, so `balanceAfter` values form an auditable chain.
 */
@Entity('wallet_ledger_entries')
@Index(['userId'])
@Index(['createdAt'])
@Index(['referenceType', 'referenceId'])
export class WalletLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 6 })
  direction: WalletLedgerDirection;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ type: 'varchar', length: 32 })
  type: WalletLedgerEntryType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceType: string | null;

  @Column({ type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 7, nullable: true })
  balanceAfter: number | null;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;
}
