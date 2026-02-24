import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../entities/user.entity';

@Entity('task_completions')
@Index(['userId', 'completedAt'])
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  taskId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  rewardXlm: number;

  @CreateDateColumn({ type: 'timestamp' })
  completedAt: Date;
}
