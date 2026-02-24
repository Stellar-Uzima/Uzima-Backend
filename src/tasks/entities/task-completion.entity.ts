import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { HealthTask } from './health-task.entity';

@Entity('task_completions')
@Index('IDX_task_completions_user_id_completed_at', ['userId', 'completedAt'])
@Index('IDX_task_completions_health_task_id', ['taskId'])
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'health_task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne(() => HealthTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'health_task_id' })
  task: HealthTask;

  @Column({ name: 'completed_at', type: 'timestamp' })
  completedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
