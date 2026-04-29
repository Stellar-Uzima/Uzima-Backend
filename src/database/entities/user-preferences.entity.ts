import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IsString, IsEnum, IsUUID, IsOptional, IsObject, Min, Max, Length } from 'class-validator';
import { User } from './user.entity';

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum NotificationType {
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  @IsUUID()
  userId: string;

  @Column({
    type: 'enum',
    enum: Theme,
    default: Theme.SYSTEM,
  })
  theme: Theme;

  @Column({ default: 'en', length: 10 })
  @IsString()
  @Length(2, 10)
  language: string;

  @Column({ type: 'jsonb', default: {} })
  @IsObject()
  notifications: {
    [key in NotificationType]: {
      enabled: boolean;
      tasks: boolean;
      rewards: boolean;
      streaks: boolean;
      referrals: boolean;
      system: boolean;
    };
  };

  @Column({ type: 'jsonb', default: {} })
  @IsObject()
  privacy: {
    profileVisibility: 'public' | 'private' | 'friends';
    showStats: boolean;
    showStreak: boolean;
    showRank: boolean;
  };

  @Column({ type: 'jsonb', default: {} })
  @IsObject()
  accessibility: {
    fontSize: 'small' | 'medium' | 'large' | 'extra-large';
    highContrast: boolean;
    reducedMotion: boolean;
    screenReader: boolean;
  };

  @Column({ type: 'jsonb', default: {} })
  @IsObject()
  app: {
    autoStartTasks: boolean;
    dailyReminderTime: string; // HH:mm format
    weeklyReportDay: number; // 0-6 (Sunday-Saturday)
    timezone: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
