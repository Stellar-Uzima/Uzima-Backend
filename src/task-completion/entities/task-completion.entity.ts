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
import { HealthTask } from '../../entities/health-task.entity';

@Entity('task_completions')
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  healthTaskId: string;

  @ManyToOne(() => HealthTask)
  @JoinColumn({ name: 'healthTaskId' })
  health_task: HealthTask;

  @Column({ default: true })
  isCompleted: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
