export enum LeaderboardPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ALL_TIME = 'all-time',
}

export const DEFAULT_LEADERBOARD_PERIOD = LeaderboardPeriod.ALL_TIME;

export function parseLeaderboardPeriod(
  value?: string,
): LeaderboardPeriod {
  const normalized = value?.toLowerCase();
  if (
    normalized &&
    Object.values(LeaderboardPeriod).includes(normalized as LeaderboardPeriod)
  ) {
    return normalized as LeaderboardPeriod;
  }
  return DEFAULT_LEADERBOARD_PERIOD;
}

export function getPeriodStartDate(period: LeaderboardPeriod): Date | null {
  const now = new Date();

  switch (period) {
    case LeaderboardPeriod.DAILY: {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case LeaderboardPeriod.WEEKLY: {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case LeaderboardPeriod.MONTHLY: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case LeaderboardPeriod.ALL_TIME:
    default:
      return null;
  }
}

export function buildLeaderboardSetKey(
  period: LeaderboardPeriod,
  countryCode?: string,
): string {
  const periodSuffix =
    period === LeaderboardPeriod.ALL_TIME ? '' : `:${period}`;

  if (countryCode) {
    return `leaderboard:country:${countryCode.toUpperCase()}${periodSuffix}`;
  }

  return `leaderboard:global${periodSuffix}`;
}
