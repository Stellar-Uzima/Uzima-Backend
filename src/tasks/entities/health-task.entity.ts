// src/tasks/entities/health-task.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum TaskCategory {
  NUTRITION = 'nutrition',
  FITNESS = 'fitness',
  MENTAL = 'mental',
  SLEEP = 'sleep',
  HYDRATION = 'hydration',
}

@Entity('health_tasks')
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TaskCategory })
  category: TaskCategory;

  @Column({ type: 'jsonb', nullable: true })
  targetProfile: Record<string, any>; // e.g. { minAge: 18, conditions: ['diabetes'] }

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
