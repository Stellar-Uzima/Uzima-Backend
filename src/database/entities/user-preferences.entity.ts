import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IsString, IsEnum, IsUUID, IsOptional, IsObject, Min, Max, Length, IsArray, IsBoolean, Matches } from 'class-validator';
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

/**
 * Categories of notifications that can be deferred by quiet hours.
 */
export enum NotificationCategory {
  TASKS = 'tasks',
  REWARDS = 'rewards',
  STREAKS = 'streaks',
  REFERRALS = 'referrals',
  SYSTEM = 'system',
}

/**
 * Quiet hours configuration.
 *
 * The interval is defined in the user's time zone (`app.timezone`) and may wrap
 * across midnight (e.g. 22:00 -> 07:00). Times are HH:mm in 24-hour format.
 */
export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/**
 * Explicit exception policy for urgent notifications.
 *
 * Urgent categories bypass quiet hours and are delivered immediately.
 * The default policy always allows `SYSTEM` integrations (security/account
 * notices). Additional categories may be opted in via `urgentCategories`.
 */
export interface UrgentPolicy {
  urgentCategories: NotificationCategory[];
}

const HHMM_REGEXP: RegExp = /^([01]\d|2[0-3]):([0-5]\d)$/;

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('suuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADEU' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column( { unique: true })
  @IsUUID
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

  @Column({ type: 'jsonb', default: () => '{}' })
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

  @Column( { type: 'jsonb', default: () => '{}' })
  @IsObject()
  privacy: {
    profileVisibility: 'public' | 'private' | 'friends';
    showStats: boolean;
    showStreak: boolean;
    showRank: boolean;
  };

  @Column( { type: 'jsonb', default: () => '{}' })
  @IsObject()
  accessibility: {
    fontSize: 'small' | 'medium' | 'large' | 'extra-large';
    highContrast: boolean;
    reducedMotion: boolean;
    screenReader: boolean;
  };

  @Column({ type: 'jsonb', default: () => '{}' })
  @IsObject()
  app: {
    autoStartTasks: boolean;
    dailyReminderTime: string; // HH:mm format
    weeklyReportDay: number; // 0-6 (Sunday-Saturday)
    timezone: string;
  };

  /**
   * Quiet hours during which non-urgent notifications are deferred.
   * The interval is interpreted in `app.timezone` and may wrap across midnight.
   */
  @Column({
    type: 'jsonb',
    default: () => '{"enabled":false,"startTime":"22:00","endTime":"07:00"}',
  })
  @IsObject()
  quietHours: QuietHours;

  /**
   * Explicit exception policy for urgent notification categories.
   * Categories listed here bypass quiet hours. `system` is always treated
   * as urgent regardless of this list.
   */
  @Column({
    type: 'jsonb',
    default: () => '{"urgentCategories":["system"]}',
  })
  @IsObject()
  urgentPolicy: UrgentPolicy;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Returns true when the given instant falls within the configured quiet hours,
   * interpreted in the user's time zone. Handles intervals that wrap around
   * midnight and day-boundary cases.
   */
  isWithinQuietHours(at: Date = new Date()): boolean {
    const qh = this.quietHours;
    if (!qh || !qh.enabled) {
      return false;
    }
    if (!HHMM_REGEXP.exec(qh.startTime) || !HHMM_REGEXP.exec(qh.endTime)) {
      return false;
    }

    const timezone = this.app?.timezone || 'UTC';
    const minutesOfDay = UserPreferences.minutesOfDayInTimezone(at, timezone);
    const start = UserPreferences.parseHIMM(qh.startTime);
    const end = UserPreferences.parseHIMM(qh.endTime);

    if (start === end) {
      // Zero-length or full-day interval: treat as disabled to avoid deferring all notifications.
      return false;
    }

    if (start < end) {
      return minutesOfDay >= start && minutesOfDay < end;
    }

    // Interval wraps across midnight (e.g. 22:00 -> 07:00).
    return minutesOfDay >= start || minutesOfDay < end;
  }

  /**
   * Returns true when the given category is explicitly exempt from quiet hours.
   * `system` is always urgent; other categories must be listed in `urgentPolicy.`
   */
  isUrgentCategory(category: NotificationCategory): boolean {
    if (category === NotificationCategory.SYSTEM) {
      return true;
    }
    const categories = this.urgentPolicy?.urgentCategories ?? [];
    return categories.includes(category);
  }

  /**
   * Determines whether a notification of the given category should be deferred
   * at the provided instant. Urgent categories bypass quiet hours.
   */
  shouldDeferNotification(category: NotificationCategory, at: Date = new Date()): boolean {
    if (this.isUrgentCategory(category)) {
      return false;
    }
    return this.isWithinQuietHours(at);
  }

  private static parseHHMM(value: string): number {
    const match = HHMM_REGEXP.exec(value);
    if (!match) {
      return 0;
    }
    return Number(match[1]) * 60 + Number(match[2]);
  }

  private static minutesOfDayInTimezone(at: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  }
}
