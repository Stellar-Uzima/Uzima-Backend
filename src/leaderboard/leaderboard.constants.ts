export const LEADERBOARD_QUEUE = 'leaderboard';

/**
 * Leaderboard ranking rules.
 */
export interface LeaderboardRankingRules {
  /** Sort direction for the primary metric. */
  order: 'asc' | 'desc';
  /** Minimum score required to be included. */
  minScore: number;
  /** User states that are eligible for ranking. */
  eligibleStates: readonly string[];
  /** User states that are always excluded from ranking. */
  excludedStates: readonly string[];
  /** How ties are resolved. */
  tieBreaker: 'competition' | 'dense' | 'ordinal';
  /** Secondary metric used to break ties deterministically. */
  tieBreakerMetric: 'completedAt' | 'createdAt';
  /** Direction for the tie-breaker metric. */
  tieBreakerOrder: 'asc' | 'desc';
}

export const DEFAULT_LEADERBOARD_RANKING_RULES: LeaderboardRankingRules = {
  order: 'desc',
  minScore: 0,
  eligibleStates: Object.freeze(['active']),
  excludedStates: Object.freeze(['banned', 'deleted', 'inactive']),
  tieBreaker: 'competition',
  tieBreakerMetric: 'completedAt',
  tieBreakerOrder: 'asc',
};

export const LEADERBOARD_RANKING_RULES_VERSION = 1;

export const LEADERBOARD_CACHE_TTL_MS = 60_000;
export const LEADERBOARD_CACHE_KEY_PREFIX = 'leaderboard:ranking';
export const LEADERBOARD_CACHE_FRESHNESS_WINDOW_MS = LEADERBOARD_CACHE_TTL_MS;