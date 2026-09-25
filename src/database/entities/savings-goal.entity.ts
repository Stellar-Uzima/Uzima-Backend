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

export enum SavingsGoalStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

export enum ContributionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

/**
 * User-defined savings goal with target amount and deadline
 */
@Entity('savings_goals')
@Index(['userId'])
@Index(['status'])
export class SavingsGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  targetAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  currentAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  autoContributionAmount: number; // Amount to auto-contribute per period

  @Column({
    type: 'enum',
    enum: ['DAILY', 'WEEKLY', 'MONTHLY'],
    nullable: true,
  })
  autoContributionFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;

  @Column({ name: 'target_date', type: 'timestamp', nullable: true })
  targetDate: Date | null;

  @Column({
    type: 'enum',
    enum: SavingsGoalStatus,
    default: SavingsGoalStatus.ACTIVE,
  })
  status: SavingsGoalStatus;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone', precision: 6 })
  updatedAt: Date;
}

/**
 * Individual contribution to a savings goal
 */
@Entity('savings_contributions')
@Index(['userId'])
@Index(['goalId'])
@Index(['status'])
@Index(['createdAt'])
export class SavingsContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'goal_id', type: 'uuid' })
  goalId: string;

  @ManyToOne(() => SavingsGoal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goal_id' })
  goal: SavingsGoal;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({
    type: 'enum',
    enum: ContributionStatus,
    default: ContributionStatus.PENDING,
  })
  status: ContributionStatus;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 64, nullable: true })
  transactionHash: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone', precision: 6 })
  updatedAt: Date;
}