import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Which claim path produced the audit record.
 */
export enum AttemptType {
  REFERRAL_REDEMPTION = 'referral_redemption',
  REWARD_CLAIM = 'reward_claim',
}

/**
 * Outcome of the guard decision.
 */
export enum AttemptOutcome {
  ALLOWED = 'allowed',
  DENIED = 'denied',
}

/**
 * Persistent audit trail for referral-redemption and reward-claim attempts.
 * Both allowed and denied attempts are recorded so support can review abuse
 * patterns and confirm the anti-abuse rules are firing.
 */
@Entity('claim_attempt_logs')
@Index(['attemptType', 'outcome'])
@Index(['userId'])
@Index(['createdAt'])
export class ClaimAttemptLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AttemptType })
  attemptType: AttemptType;

  @Column({ type: 'uuid' })
  userId: string;

  /** Free-form context for the attempt, e.g. `{ referrerId, referralCode }`. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: AttemptOutcome })
  outcome: AttemptOutcome;

  /** Why the attempt was denied (null when allowed). */
  @Column({ type: 'text', nullable: true })
  denialReason: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}