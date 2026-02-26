// src/tasks/entities/task-completion.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { HealthTask } from './health-task.entity';

@Entity('task_completions')
export class TaskCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => HealthTask, { nullable: false, onDelete: 'CASCADE' })
  task: HealthTask;

  @Column({ type: 'date' })
  completedDate: string;

  @CreateDateColumn()
  createdAt: Date;
}
