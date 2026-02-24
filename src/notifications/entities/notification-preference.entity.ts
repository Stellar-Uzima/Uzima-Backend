import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
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

  @Column({ nullable: true })
  quietHoursStart: string; // 'HH:mm' format

  @Column({ nullable: true })
  quietHoursEnd: string; // 'HH:mm' format

  @Column({ default: 'Africa/Lagos' })
  timezone: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
