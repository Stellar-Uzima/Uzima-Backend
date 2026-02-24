import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { HealthTask } from './health-task.entity';

@Entity('daily_task_assignments')
@Unique(['user', 'assignedDate'])
export class DailyTaskAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToMany(() => HealthTask, (healthTask) => healthTask.dailyTaskAssignments)
  @JoinTable({
    name: 'daily_task_assignment_tasks',
    joinColumn: {
      name: 'daily_task_assignment_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'health_task_id',
      referencedColumnName: 'id',
    },
  })
  tasks: HealthTask[];

  @Column({ name: 'assigned_date', type: 'date' })
  assignedDate: string;
}
