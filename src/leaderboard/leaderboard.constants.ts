export const LEADERBOARD_QUEUE = 'leaderboard';

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all-time';

export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = [
  'weekly',
  'monthly',
  'all-time',] as const;

export interface LeaderboardDateRange {
  period: LeaderboardPeriod;
  starts: Date;
  ends: Date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfUtcISOWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  // ISO week starts on Monday (1) and ends on Sunday (7).
  const dayOfWeek = day.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addUtcDays(day, diff);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function getLeaderboardDateRange(
  period: LeaderboardPeriod,
  now: Date = new Date(),
): LeaderboardDateRange {
  switch (period) {
    case 'weekly': {
      // UTC boundaries: Monday 00:00:00.000 to next Monday 00:00:00.000 (exclusive).
      const starts = startOfUtcISOWeek(now);
      return { period, starts, ends: addUtcDays(starts, 7) };
    }
    case 'monthly': {
      // UTC boundaries: first day 00:00:00.000 to first of next month (exclusive).
      const starts = startOfUtcMonth(now);
      const ends = new Date(Date.UTC(starts.getUTCFullYear(), starts.getUTCMonth() + 1, 1));
      return { period, starts, ends };
    }
    case 'all-time': {
      return { period, starts: new Date(0), ends: new Date(8640000000000000) };
    }
    default: {}
  }
}

export function isWithinPeriod(
  date: Date,
  range: LeaderboardDateRange,
): boolean {
  const time = date.getTime();
  return time >= range.starts.getTime() && time < range.ends.getTime();
}

export const LEADERBOARD_CACHE_TTL_MS = 60_000;
export const LEADERBOARD_CACHE_KEY_PREFIX = 'leaderboard:ranking';
export const LEADERBOARD_CACHE_FRESHNESS_WINDOW_MS = LEADERBOARD_CACHE_TTL_MS;