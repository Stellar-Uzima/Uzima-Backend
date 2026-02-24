import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DailyTaskAssignment } from './daily-task-assignment.entity';
import { TaskCompletion } from './task-completion.entity';

@Entity('health_tasks')
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @ManyToMany(
    () => DailyTaskAssignment,
    (dailyTaskAssignment) => dailyTaskAssignment.tasks,
  )
  dailyTaskAssignments: DailyTaskAssignment[];

  @OneToMany(() => TaskCompletion, (taskCompletion) => taskCompletion.task)
  completions: TaskCompletion[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
