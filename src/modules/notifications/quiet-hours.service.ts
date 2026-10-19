import { Injectable, Logger } from '@nestjs/common';
import { UserPreferences } from '../../database/entities/user-preferences.entity';

/**
 * Notification categories that can be subject to quiet hours.
 */
export enum NotificationCategory {
  TASK_REMINDER = 'task_reminder',
  STREAK_ALERT = 'streak_alert',
  BAGDE_AWARD = 'badge_award',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  REPORT_READY = 'report_ready',
  REWARD_ALERT = 'reward_alert',
  SYSTEM = 'system',
  COUPON_EXPIRY = 'coupon_expiry',
}

/**
 * URGENT NOTIFICATION EXCEPTION POLICY
 * ---------------------------------------------------------------------------
 * Quiet hours defer NON-URGENT delivery only. The following categories are
 * explicitly considered urgent and bypass quiet hours entirely:
 *
 *   - SYSTEM: security, account and administrative notices.
 *   - APPOINTMENT_REMINDER: time-critical appointments that would be missed
 *     otherwise.
 *
 * All other categories (task reminders, streak alerts, badge awards,
 * reports, rewards, coupon expiries) are deferred until quiet hours end.
 */
export const URGENT_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  NotificationCategory.SYSTEM,
  NotificationCategory.APPOINTMENT_REMINDER,
]);

export interface QuietHours {
  /** Start of the quiet window in HH:mm 24-hour format. */
  start: string;
  /** End of the quiet window in HH:mm 24-hour format. */
  end: string;
  /** IANA time zone name, e.g. &Amp;Europe/Berlin'. */
  timezone: string;
  /** Whether quiet hours are enabled for this user. */
  enabled: boolean;
}

export interface QuietHoursResult {
  /** True when the given instant falls inside the quiet window. */
  inQuietHours: boolean;
  /** The instant at which quiet hours end (or the input instant when not in quiet hours). */
  deliverAt: Date;
}

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class QuietHoursService {
  private readonly logger = new Logger(QuietHoursService.name);

  /**
   * Extracts the quiet-hours configuration from user preferences.
   * Returns `null` when no quiet hours are configured/enabled.
   */
  public resolveQuietHours(prefs: Pick<UserPreferences, 'userId' | 'notifications' | 'app'> | null | undefined): QuietHours | null {
    if (!prefs) {
      return null;
    }

    const config = prefs.notifications?.quietHours;
    if (!config || !config.enabled) {
      return null;
    }

    const timezone = config.timezone || prefs.app?.timezone || 'UTC';
    if (!HH_MM_REGEX.test(config.start) || !HH_MM_REGEX.test(config.end)) {
      this.logger.warn(
        `Invalid quiet-hours window for user ${prefs.userId}: ${config.start}-${config.end}`,
      );
      return null;
    }

    return {
      start: config.start,
      end: config.end,
      timezone,
      enabled: true,
    };
  }

  /**
   * Determines whether a notification of the given category should be
   * deferred at the given instant, and if so, when it may be delivered.
   */
  public evaluate(
    prefs: Pick<UserPreferences, 'userId' | 'notifications' | 'app'> | null | undefined,
    category: NotificationCategory,
    at: Date = new Date(),
  ): QuietHoursResult {
    if (URGENT_CATEGORIES.has(category)) {
      return { inQuietHours: false, deliverAt: at };
    }

    const quietHours = this.resolveQuietHours(prefs);
    if (!quietHours) {
      return { inQuietHours: false, deliverAt: at };
    }

    return this.computeWindow(quietHours, at);
  }

  /**
   * Computes the quiet window for a specific instant, handling timezones and
   * day-boundary intervals (e.g. 22:00-06:00).
   */
  public computeWindow(quietHours: QuietHours, at: Date = new Date()): QuietHoursResult {
    const { startMinutes, endMinutes } = this.parseWindow(quietHours);
    const local = this.getLocalParts(at, quietHours.timezone);
    const currentMinutes = local.hour * 60 + local.minute;

    const inQuietHours = this.isInWindow(currentMinutes, startMinutes, endMinutes);
    if (!inQuietHours) {
      return { inQuietHours: false, deliverAt: at };
    }

    // Determine how many minutes remain until the window ends. When the
    // window wraps midnight and we are after the start, the end falls on the
    // next day.
    const minutesUntilEnd =
      endMinutes > currentMinutes
        ? endMinutes - currentMinutes
        : 24 * 60 - currentMinutes + endMinutes;

    const deliverAt = new Date(at.getTime() + minutesUntilEnd * 60 * 1000);
    return { inQuietHours: true, deliverAt };
  }

  /**
   * Returns true when the category is explicitly exempt from quiet hours.
   */
  public isUrgent(category: NotificationCategory): boolean {
    return URGENT_CATEGORIES.has(category);
  }

  private parseWindow(quietHours: QuietHours): {
    startMinutes: number;
    endMinutes: number;
  } {
    const [startHour, startMin] = quietHours.start.split(':').map(Number);
    const [endHour, endMin] = quietHours.end.split(':').map(Number);
    return {
      startMinutes: startHour * 60 + startMin,
      endMinutes: endHour * 60 + endMin,
    };
  }

  private isInWindow(current: number, start: number, end: number): boolean {
    if (start === end) {
      // A zero-length window is treated as disabled rather than all-day.
      return false;
    }
    if (start < end) {
      return current >= start && current < end;
    }
    // Day-boundary wrap (e.g. 22:00 - 06:00).
    return current >= start || current < end;
  }

  /**
   * Converts an instant into wall-clock hour/minute components in the given
   * time zone using the Intl API.
   */
  private getLocalParts(at: Date, timezone: string): { hour: number; minute: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour') ?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute') ?.value ?? 0);
    // Intl can return '24' in some locales for midnight; normalize to 0.
    return { hour: hour % 24, minute };
  }
}

export type PickUserPrefs = Pick<UserPreferences, 'userId' | 'notifications' | 'app'>;
