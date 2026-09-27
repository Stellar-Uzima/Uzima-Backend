import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { ReferralRecord } from './referral-record.entity';
import { RewardStatus } from '../../rewards/enums/reward-status.enum';
import { Currency } from '../../shared/currency/currency.enum';

/**
 * Immutable ledger row recording one referral reward settlement: the referral
 * that became eligible, the qualifying action that unlocked it, and the reward
 * transaction that credited the referrer.
 *
 * `referralId` is unique, so a single referral can be settled at most once, and
 * `rewardTransactionId` is unique, so the same reward transaction can never be
 * attached to two referrals. Together with the `referral_records.reward_paid`
 * flag these constraints make double payouts impossible even when settlement
 * is attempted concurrently.
 */
@Entity('referral_reward_settlements')
@Unique(['referralId'])
@Unique(['rewardTransactionId'])
export class ReferralRewardSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'referralId' })
  @Index()
  referralId: string;

  @ManyToOne(() => ReferralRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referralId' })
  referral: ReferralRecord;

  @Column({ type: 'uuid', name: 'referrerId' })
  @Index()
  referrerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  @Column({ type: 'uuid', name: 'referredId' })
  @Index()
  referredId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referredId' })
  referred: User;

  /** Qualifying action that made the referral payable. */
  @Column({ type: 'varchar', length: 64, name: 'qualifyingAction' })
  qualifyingAction: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({
    type: 'varchar',
    length: 32,
    default: Currency.XLM,
  })
  currency: Currency;

  @Column({
    type: 'varchar',
    length: 16,
    default: RewardStatus.PENDING,
  })
  status: RewardStatus;

  /** The credit created for the referrer. */
  @Column({ type: 'uuid', name: 'rewardTransactionId', nullable: true })
  rewardTransactionId?: string | null;

  @ManyToOne(() => RewardTransaction, { nullable: true })
  @JoinColumn({ name: 'rewardTransactionId' })
  rewardTransaction?: RewardTransaction | null;

  /** Free-form context for auditing, e.g. `{ referenceId: completionId }`. */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({
    type: 'timestamp',
    name: 'settledAt',
    default: () => 'CURRENT_TIMESTAMP',
  })
  settledAt: Date;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
