import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';

import { RewardStatus } from '../enums/reward-status.enum';

/**
 * TypeORM entity for the `reward_transactions` table. Represents a single
 * attempt to pay a user a reward (typically for completing a task) via a
 * Stellar transaction.
 *
 * Tracks the reward `amount`, its `status` (PENDING/SUCCESS/FAILED), the
 * resulting `stellarTxHash` once submitted, and the number of retry
 * `attempts`. Optionally links back to the `TaskCompletion` that
 * triggered the reward via `taskCompletionId`.
 */
@Entity('reward_transactions')
export class RewardTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: RewardStatus,
    default: RewardStatus.PENDING,
  })
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
