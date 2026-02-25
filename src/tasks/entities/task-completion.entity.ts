import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { HealthTask } from './health-task.entity';
import { CompletionStatus } from '../enums/completion-status.enum';

@Entity('task_completions')
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => HealthTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'taskId' })
  task: HealthTask;

  @Column({ nullable: true })
  proofUrl: string;

  @Column({
    type: 'enum',
    enum: CompletionStatus,
    default: CompletionStatus.PENDING,
  })
  status: CompletionStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  xlmRewarded: number;

  @CreateDateColumn()
  completedAt: Date;
}
