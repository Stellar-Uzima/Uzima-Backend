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
import { User } from '../../entities/user.entity';

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

export enum NotificationCategory {
  TASKS = 'tasks',
  REWARDS = 'rewards',
  STREAKS = 'streaks',
  REFERRALS = 'referrals',
  SYSTEM = 'system',
}

export const NotificationCategories: NotificationCategory[] = [
  NotificationCategory.TASKS,
  NotificationCategory.REWARDS,
  NotificationCategory.STREAKS,
  NotificationCategory.REFERRALS,
  NotificationCategory.SYSTEM,
];

export const NotificationTypes: NotificationType[] = [
  NotificationType.EMAIL,
  NotificationType.PUSH,
  NotificationType.SMS,
];

export interface NotificationChannelPreference {
  enabled: boolean;
  tasks: boolean;
  rewards: boolean;
  streaks: boolean;
  referrals: boolean;
  system: boolean;
}

export type NotificationPreferences = {
  [key in NotificationType]: NotificationChannelPreference;
};

/**
 * Push device token lifecycle.
 * - Users register/revoke their own device tokens.
 * - Tokens rejected by the provider are disabled (`active = false`) and
 *   recorded with `disabledReason`, so they are never targeted again.
 */
export enum PushTokenStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  INVALID = 'invalid',
}

export interface PushDeviceToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
  status: PushTokenStatus;
  registeredAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  disabledAt?: string; // ISO timestamp
  disabledReason?: string;
}

export function createDefaultNotificationPreferences(): NotificationPreferences {
  const defaultChannel = (): NotificationChannelPreference => ({
    enabled: true,
    tasks: true,
    rewards: true,
    streaks: true,
    referrals: true,
    system: true,
  });

  return {
    [NotificationType.EMAIL]: defaultChannel(),
    [NotificationType.PUSH]: defaultChannel(),
    [NotificationType.SMS]: defaultChannel(),
  };
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

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  @IsObject()
  notifications: NotificationPreferences;

  /**
   * Push device tokens registered by this user. Revoked/invalid tokens are
   * kept (status-tagged) so provider feedback is not re-applied repeatedly.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  @IsObject()
  pushTokens: PushDeviceToken[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  @IsObject()
  privacy: {
    profileVisibility: 'public' | 'private' | 'friends';
    showStats: boolean;
    showStreak: boolean;
    showRank: boolean;
  };

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  @IsObject()
  accessibility: {
    fontSize: 'small' | 'medium' | 'large' | 'extra-large';
    highContrast: boolean;
    reducedMotion: boolean;
    screenReader: boolean;
  };

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
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
