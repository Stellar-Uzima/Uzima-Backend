import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../entities/user.entity';

export enum WalletTransactionType {
  DEPOSIT = 'DEPOSIT',           // External deposit / top-up
  WITHDRAWAL = 'WITHDRAWAL',     // External withdrawal
  REWARD = 'REWARD',             // Task/activity reward
  TRANSFER_IN = 'TRANSFER_IN',   // Transfer from another user
  TRANSFER_OUT = 'TRANSFER_OUT', // Transfer to another user
  SAVINGS_CONTRIBUTION = 'SAVINGS_CONTRIBUTION', // Contribution to savings goal
  SAVINGS_WITHDRAWAL = 'SAVINGS_WITHDRAWAL', // Withdrawal from savings goal
  CONSULTATION_PAYMENT = 'CONSULTATION_PAYMENT', // Payment for consultation
  REFUND = 'REFUND',             // Refund
  FEE = 'FEE',                   // Platform fee
}

export enum WalletTransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Comprehensive wallet transaction log for audit trail
 */
@Entity('wallet_transactions')
@Index(['userId'])
@Index(['type'])
@Index(['status'])
@Index(['createdAt'])
@Index(['referenceId'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: WalletTransactionType,
  })
  type: WalletTransactionType;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number; // Positive for credit, negative for debit

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  balanceBefore: number;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  balanceAfter: number;

  @Column({
    type: 'enum',
    enum: WalletTransactionStatus,
    default: WalletTransactionStatus.PENDING,
  })
  status: WalletTransactionStatus;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null; // Links to withdrawal, savings goal, reward, etc.

  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null; // 'withdrawal', 'savings_goal', 'reward', 'transfer', etc.

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'source_address', type: 'varchar', length: 56, nullable: true })
  sourceAddress: string | null;

  @Column({ name: 'destination_address', type: 'varchar', length: 56, nullable: true })
  destinationAddress: string | null;

  @Column({ name: 'stellar_tx_hash', type: 'varchar', length: 64, nullable: true })
  stellarTxHash: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone', precision: 6 })
  updatedAt: Date;
}