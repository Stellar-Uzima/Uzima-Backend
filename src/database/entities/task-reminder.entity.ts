import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
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

export interface DeliveryTracking {
  error?: string;
  timestamp?: Date | string;
  sentAt?: Date | string;
  status?: 'delivered' | 'failed_by_notification_service';
  backfill?: boolean;
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
  deliveryTracking: DeliveryTracking | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
