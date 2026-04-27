import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HealthTask } from '../../entities/health-task.entity';
import { User } from '../../entities/user.entity';

export enum ReminderType {
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export enum ReminderStatus {
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('task_reminders')
@Index(['userId', 'remindAt'])
@Index(['status'])
@Index(['createdAt'])
export class TaskReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => HealthTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: HealthTask;

  @Column()
  taskId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'timestamp' })
  remindAt: Date;

  @Column({
    type: 'enum',
    enum: ReminderType,
    default: ReminderType.PUSH,
  })
  type: ReminderType;

  @Column({
    type: 'enum',
    enum: ReminderStatus,
    default: ReminderStatus.SCHEDULED,
  })
  status: ReminderStatus;

  @Column({ type: 'jsonb', nullable: true })
  deliveryTracking: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
