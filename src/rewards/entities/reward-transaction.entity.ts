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
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';

import { RewardStatus } from '../enums/reward-status.enum';
import { Currency } from '../../shared/currency/currency.enum';

/**
 * TypeORM entity for the `reward_transactions` table. Represents a single
 * attempt to pay a user a reward (typically for completing a task) via a
 * Stellar transaction.
 *
 * Tracks the reward `amount`, its `status` (PENDING/SUCCESS/FAILED), the
 * resulting `stellarTxHash` once submitted, and the number of retry
 * `attempts`. Optionally links back to the `TaskCompletion` that
 * triggered the reward via `taskCompletionId`.
 *
 * Currency metadata (`currency`, `amountUsd`, `rateApplied`, `rateSource`,
 * `rateFetchedAt`) is snapshotted at the moment the reward is created so
 * later conversion lookups are reproducible even if spot prices change.
 */
@Entity('reward_transactions')
export class RewardTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 18, scale: 7 })
  amount: number;

  @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.XLM,
  })
  @Index()
  currency: Currency;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  amountUsd?: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 8,
    nullable: true,
  })
  rateApplied?: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  rateSource?: string;

  @Column({ type: 'timestamp', nullable: true })
  rateFetchedAt?: Date;

  @Column({
    type: 'enum',
    enum: RewardStatus,
    default: RewardStatus.PENDING,
  })
  @Index()
  status: RewardStatus;

  @Column({ nullable: true })
  stellarTxHash?: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'uuid', nullable: true })
  taskCompletionId?: string;

  @ManyToOne(() => TaskCompletion, { nullable: true })
  @JoinColumn({ name: 'taskCompletionId' })
  task_completion?: TaskCompletion;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
