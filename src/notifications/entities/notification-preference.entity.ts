import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../entities/user.entity';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: true })
  taskReminders: boolean;

  @Column({ default: true })
  rewardAlerts: boolean;

  @Column({ default: true })
  streakAlerts: boolean;

  @Column({ default: true })
  emailNotifications: boolean;

  @Column({ default: true })
  smsNotifications: boolean;

  @Column({ default: true })
  pushNotifications: boolean;

  @Column({ nullable: true })
  quietHoursStart: string; // 'HH:mm' format

  @Column({ nullable: true })
  quietHoursEnd: string; // 'HH:mm' format

  @Column({ default: 'Africa/Lagos' })
  timezone: string;

  /**
   * Granular channel preferences per notification type.
   * Structure: { [notification_type]: { email: boolean, push: boolean, sms: boolean } }
   * Example: { "task_reminder": { email: true, push: true, sms: false } }
   */
  @Column({ type: 'jsonb', default: {} })
  channelPreferences: Record<string, Record<string, boolean>>;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
