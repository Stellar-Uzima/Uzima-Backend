export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all-time';

export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['weekly', 'monthly', 'all-time'];

export class LeaderboardEntryDto {
  rank: number;
  userId: string;
  displayName: string;
  totalXlm: number;
  country: string;
}

export class LeaderboardPeriodRangeDto {
  start: string | null;
  end: string | null;
}

export class LeaderboardPeriodQueryDto {
  period?: LeaderboardPeriod;
}

export class LeaderboardResponseDto {
  topRankings: LeaderboardEntryDto[];
  myRank: {
    rank: number | null;
    totalXlm: number;
  };
  period?: LeaderboardPeriod;
  range?: LeaderboardPeriodRangeDto;
}

/**
 * Ranking rules (documented and tested):
 *
 * 1. Eligible user states: only users with accountStatus === 'active' and
 *    verified === true are included in rankings. Accounts that are banned,
 *    suspended, deleted, or unverified are excluded.
 *
 * 2. Sorting: entries are ordered by totalXlm descending. The sort is stable
 *    and deterministic for a fixed data set.
 *
 * 3. Tie handling: users with equal totalXlm share the same rank
 *    (competition ranking, "1224"). The next distinct totalXlm value receives
 *    rank equal to the number of entries preceding it plus one. Within a tie,
 *    entries are ordered by userId ascending to guarantee determinism.
 *
 * 4. myRank: for an eligible user, myRank.rank is the shared rank and
 *    myRank.totalXlm is the user's total. For an excluded user, myRank.rank
 *    is null and myRank.totalXlm is 0.
 */
export const LEADERBOARD_RANKING_RULES = {
  eligibleAccountStatuses: ['active'] as const,
  requiresVerified: true,
  tieHandling: 'competition' as const,
  tieBreaker: 'userId-asc' as const,
  sortBy: 'totalXlm-desc' as const,
  excludedHyRank: null,
  excludedHyTotalXlm: 0,
} as const;
