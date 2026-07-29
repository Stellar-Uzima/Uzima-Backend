import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../database/entities/user.entity';

export enum NotificationTypeEnum {
  TASK_REMINDER = 'task_reminder',
  STREAK_ALERT = 'streak_alert',
  BADGE_AWARD = 'badge_award',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  REPORT_READY = 'report_ready',
  REWARD_ALERT = 'reward_alert',
  SYSTEM = 'system',
  COUPON_EXPIRY = 'coupon_expiry',
}

export enum DeliveryChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

@Entity('in_app_notifications')
@Index(['userId', 'readAt'])
@Index(['userId', 'createdAt'])
export class InAppNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationTypeEnum,
    default: NotificationTypeEnum.SYSTEM,
  })
  type: NotificationTypeEnum;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any> | null;

  /**
   * Null means unread; set to the timestamp when the user read it.
   */
  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  /**
   * Which delivery channels were successfully dispatched for this notification.
   * Always contains 'in_app'; other channels are added as they succeed.
   */
  @Column({
    type: 'simple-array',
    default: 'in_app',
  })
  deliveredChannels: string[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
