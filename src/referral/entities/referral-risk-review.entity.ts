import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { Currency } from '../../shared/currency/currency.enum';
import { ReferralRecord } from './referral-record.entity';
import {
  ReferralRiskReasonCode,
  ReferralRiskReviewStatus,
} from '../referral-reward.constants';

@Entity('referral_risk_reviews')
@Unique(['referralId'])
export class ReferralRiskReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referralId: string;

  @ManyToOne(() => ReferralRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referralId' })
  referral: ReferralRecord;

  @Column({ type: 'uuid' })
  referrerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  @Column({ type: 'uuid' })
  referredId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referredId' })
  referred: User;

  @Column({ type: 'varchar', length: 64 })
  reasonCode: ReferralRiskReasonCode;

  @Column({ type: 'jsonb' })
  reasonCodes: ReferralRiskReasonCode[];

  @Column({ type: 'jsonb' })
  signalDetails: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: ReferralRiskReviewStatus.PENDING })
  status: ReferralRiskReviewStatus;

  @Column({ type: 'varchar', length: 64 })
  qualifyingAction: string;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({ type: 'varchar', length: 32, default: Currency.XLM })
  currency: Currency;

  @Column({ type: 'varchar', length: 128, nullable: true })
  referenceId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedBy' })
  reviewer?: User | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
