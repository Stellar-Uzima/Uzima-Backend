// src/tasks/entities/daily-task-assignment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Column,
  Unique,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { HealthTask } from './health-task.entity';

@Entity('daily_task_assignments')
@Unique(['user', 'assignedDate'])
export class DailyTaskAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @ManyToMany(() => HealthTask, { eager: true })
  @JoinTable({
    name: 'daily_task_assignment_tasks',
    joinColumn: { name: 'assignment_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'task_id', referencedColumnName: 'id' },
  })
  tasks: HealthTask[];

  @Column({ type: 'date' })
  assignedDate: string;

  @CreateDateColumn()
  createdAt: Date;
}
