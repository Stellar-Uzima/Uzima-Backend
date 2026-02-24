import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TaskCompletion } from '../../task-completion/entities/task-completion.entity';

export enum RewardStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('reward_transactions')
export class RewardTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  amount: number;

  @Column({
    type: 'enum',
    enum: RewardStatus,
    default: RewardStatus.PENDING,
  })
  status: RewardStatus;

  @Column({ nullable: true })
  stellarTxHash?: string;

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
