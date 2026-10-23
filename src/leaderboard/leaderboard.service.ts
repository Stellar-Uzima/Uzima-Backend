import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Redis from 'ioredis';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../rewards/enums/reward-status.enum';
import {
  LeaderboardResponseDto,
  LeaderboardEntryDto,
} from './dto/leaderboard.dto';
import {
  LeaderboardPeriod,
  DEFAULT_LEADERBOARD_PERIOD,
  getPeriodStartDate,
  buildLeaderboardSetKey,
} from './leaderboard-period.enum';
import {
  LeaderboardAccountStatus,
  isEligibleForLeaderboard,
} from './leaderboard-ranking.rules';

export interface LeaderboardCalculationRow {
  userId: string;
  totalXlm: number;
  displayName: string;
  country: string;
  category?: string;
  firstTaskCompletedAt?: Date;
  /** Account state used to determine eligibility. Defaults to ACTIVE. */
  status?: LeaderboardAccountStatus | string;
}

export interface RankedLeaderboardRow extends LeaderboardCalculationRow {
  /** Competition rank (1-based). Tied rows share the same rank. */
  rank: number;
}

export interface StreakMilestoneEvent {
  /** Unique identifier for the milestone (e.g. 'streak_7') */
  id: string;
  /** Streak length (in days) that triggers this milestone */
  streakDays: number;
  /** Reward amount in XLM issued when this milestone is reached */
  rewardAmountXlm: number;
}

export interface StreakRewardEligibilityResult {
  eligible: boolean;
  milestoneId: string | null;
  rewardAmountXlm: number;
  issued: boolean;
  reason?: string;
}

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly redis: Redis;

  /** Cache performance counters for benchmark/regression tracking */
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalResponseTimeMs = 0;
  private requestCount = 0;

  /** Configured streak milestone events that can trigger rewards. */
  private streakMilestones: StreakMilestoneEvent[] = [];
  private streakMilestoneById = new Map<string, StreakMilestoneEvent>();
  private streakMilestoneByDays = new Map<number, StreakMilestoneEvent>();

  constructor(
    @InjectRepository(RewardTransaction)
    private readonly rewardTransactionRepository: Repository<RewardTransaction>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.redis = (this.cacheManager.stores as any).client;
    this.configureStreakMilestones([
      { id: 'streak_7', streakDays: 7, rewardAmountXlm: 1 },
      { id: 'streak_14', streakDays: 14, rewardAmountXlm: 2 },
      { id: 'streak_30', streakDays: 30, rewardAmountXlm: 5 },
      { id: 'streak_100', streakDays: 100, rewardAmountXlm: 20 },
    ]);
  }

  /**
   * Register the configured streak milestone events. Only milestones registered
   * here can trigger awards.
   */
  configureStreakMilestones(milestones: StreakMilestoneEvent[]): void {
    this.streakMilestones = [];
    this.streakMilestoneById = new Map();
    this.streakMilestoneByDays = new Map();

    for (const milestone of milestones) {
      if (!milestone.id || milestone.streakDays <= 0 || milestone.rewardAmountXlm <= 0) {
        throw new Error(
          `Invalid streak milestone configuration: ${JSON.stringify(milestone)}`,
        );
      }
      if (
        this.streakMilestoneById.has(milestone.id) ||
        this.streakMilestoneByDays.has(milestone.streakDays)
      ) {
        throw new Error(
          `Duplicate streak milestone configuration for id=${milestone.id} or days=${milestone.streakDays}`,
        );
      }
      this.streakMilestones.push(milestone);
      this.streakMilestoneById.set(milestone.id, milestone);
      this.streakMilestoneByDays.set(milestone.streakDays, milestone);
    }
  }

  getStreakMilestones(): StreakMilestoneEvent[] {
    return this.streakMilestones.map(($milestone) => ({ ...$milestone }));
  }

  /**
   * Resolve the configured milestone for a validated streak length. Returns null
   * when the streak length does not match any configured milestone.
   */
  resolveStreakMilestone(streakDays: number): StreakMilestoneEvent | null {
    if (!Number.isFinite(streakDays) || streakDays <= 0) {
      return null;
    }
    return this.streakMilestoneByDays.get(streakDays) ?? null;
  }

  private buildStreakRewardIdempotencyKey(
    userId: string,
    milestoneId: string,
  ): string {
    return `streak:reward:issued:${userId}:${milestoneId}`;
  }

  /**
   * Connect a validated streak milestone to reward issuance.
   *
   * Acceptance criteria:
   * - Only configured milestone events can trigger awards.
   * - Duplicate milestone processing cannot issue duplicate rewards.
   */
  async processStreakMilestoneReward(
    userId: string,
    streakDays: number,
  ): Promise<StreakRewardEligibilityResult> {
    const milestone = this.resolveStreakMilestone(streakDays);
    if (!milestone) {
      return {
        eligible: false,
        milestoneId: null,
        rewardAmountXlm: 0,
        issued: false,
        reason: 'No configured milestone matches the provided streak length',
      };
    }

    const idempotencyKey = this.buildStreakRewardIdempotencyKey(
      userId,
      milestone.id,
    );

    // Atomic claim: SET if not exists guarantees only one processor can issue
    // the reward for a given user/milestone pair.
    const claimed = await this.redis.set(
      idempotencyKey,
      'pending',
      'NX',
    );
    if (claimed !== 'OK') {
      return {
        eligible: true,
        milestoneId: milestone.id,
        rewardAmountXlm: milestone.rewardAmountXlm,
        issued: false,
        reason: 'Reward already issued for this milestone',
      };
    }

    try {
      const transaction = this.rewardTransactionRepository.create({
        userId,
        amount: milestone.rewardAmountXlm,
        status: RewardStatus.SUCCESS,
        reference: milestone.id,
      } as Partial<RewardTransaction>);
      await this.rewardTransactionRepository.save(transaction);

      await this.redis.set(idempotencyKey, 'done');

      return {
        eligible: true,
        milestoneId: milestone.id,
        rewardAmountXlm: milestone.rewardAmountXlm,
        issued: true,
      };
    } catch (error) {
      // Roll back the claim so a later retry can succeed.
      await this.redis.del(idempotencyKey).catch(() => undefined);
      this.logger.error(
        `Failed to issue streak reward for user ${userId} milestone ${milestone.id}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private formatDisplayName(fullName: string): string {
    const parts = fullName.trim().split(' ');
    if (parts.length <= 1) return fullName;
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    return `${firstName} ${lastName.charAt(0)}.`;
  }

  /**
   * Filter out accounts that are not eligible for ranking.
   * Eligibility rules are documented in leaderboard-ranking.rules.ts.
   */
  filterEligibleRows(
    rows: LeaderboardCalculationRow[],
  ): LeaderboardCalculationRow[] {
    return rows.filter((row) => isEligibleForLeaderboard(row));
  }

  /**
   * Deterministic ranking of leaderboard rows.
   *
   * Sort order (tie-breakers):
   * 1. totalXlm descending.
   * 2. firstTaskCompletedAt ascending (missing timestamps last).
   * 3. userId ascending (lexicographical) for stable deterministic ordering.
   */
  rankLeaderboardRows(
    rows: LeaderboardCalculationRow[],
  ): LeaderboardCalculationRow[] {
    return [...rows].sort((left, right) => {
      if (right.totalXlm !== left.totalXlm) {
        return right.totalXlm - left.totalXlm;
      }

      const leftTimestamp =
        left.firstTaskCompletedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTimestamp =
        right.firstTaskCompletedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
      }

      return left.userId.localeCompare(right.userId);
    });
  }

  /**
   * Assign competition ranks to already-sorted rows.
   * Rows that tie on (totalXlm, firstTaskCompletedAt) share the same rank.
   * The userId tie-breaker only affects display order, not the rank number.
   */
  assignRanks(
    sortedRows: LeaderboardCalculationRow[],
  ): RankedLeaderboardRow[] {
    const ranked: RankedLeaderboardRow[] = [];
    let currentRank = 0;
    let previousKey: string | null = null;

    for (let index = 0; index < sortedRows.length; index++) {
      const row = sortedRows[index];
      const key = `${row.totalXlm}::${row.firstTaskCompletedAt?.getTime() ?? 'none'}`;

      if (key !== previousKey) {
        currentRank = index + 1;
        previousKey = key;
      }

      ranked.push({ ...row, rank: currentRank });
    }

    return ranked;
  }

  filterLeaderboardRowsByCategory(
    rows: LeaderboardCalculationRow[],
    category?: string,
  ): LeaderboardCalculationRow[] {
    if (!category) {
      return [...rows];
    }

    return rows.filter((row) => row.category === category);
  }

  paginateLeaderboardRows(
    rows: LeaderboardCalculationRow[],
    page: number = 1,
    limit: number = 50,
  ): LeaderboardCalculationRow[] {
    if (page < 1 || limit < 1) {
      return [];
    }

    const startIndex = (page - 1) * limit;
    return rows.slice(startIndex, startIndex + limit);
  }

  buildLeaderboardResponse(
    rows: LeaderboardCalculationRow[],
    userId: string,
    options?: {
      category?: string;
      countryCode?: string;
      page?: number;
      limit?: number;
    },
  ): LeaderboardResponseDto {
    const {
      category,
      countryCode,
      page = 1,
      limit = 50,
    } = options ?? {};

    // Exclude ineligible accounts before ranking.
    const eligibleRows = this.filterEligibleRows(rows);
    const filteredRows = this.filterLeaderboardRowsByCategory(
      eligibleRows,
      category,
    );
    const sortedRows = this.rankLeaderboardRows(filteredRows);
    const rankedRows = this.assignRanks(sortedRows);
    const paginatedRows = this.paginateLeaderboardRows(rankedRows, page, limit);
    const myRankIndex = rankedRows.findIndex((row) => row.userId === userId);
    const myRow = myRankIndex >= 0 ? rankedRows[myRankIndex] : null;

    return {
      topRankings: paginatedRows.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        displayName: row.displayName,
        totalXlm: row.totalXlm,
        country: countryCode || row.country || 'Global',
      })),
      myRank: {
        rank: myRow ? myRow.rank : null,
        totalXlm: myRow?.totalXlm ?? 0,
      },
    };
  }

  async getLeaderboard(
    userId: string,
    limit: number = 50,
    countryCode?: string,
    page: number = 1,
    period: LeaderboardPeriod = DEFAULT_LEADERBOARD_PERIOD,
  ): Promise<LeaderboardResponseDto> {
    const startTime = performance.now();
    const setKey = buildLeaderboardSetKey(period, countryCode);
    const namesKey = `leaderboard:metadata:names`;
    const startIndex = Math.max(page - 1, 0) * limit;
    const endIndex = startIndex + limit - 1;

    // Get Top N IDs and Scores from the Sorted Set
    const rawTopUsers = await this.redis.zrevrange(
      setKey,
      startIndex,
      endIndex,
      'WITHSCORES',
    );

    // Track cache hit/miss for benchmark monitoring.
    // NOTE: An empty sorted set is treated as a "miss" — this is conservative
    // because an empty-but-valid leaderboard (no users with rewards yet) is also
    // counted as a miss. For accurate benchmarks, ensure the leaderboard is
    // pre-populated before measuring cache performance.
    if (rawTopUsers.length > 0) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }

    // Extract IDs to fetch names from our Hash in one go
    const userIds: string[] = [];
    for (let i = 0; i < rawTopUsers.length; i += 2) {
      userIds.push(rawTopUsers[i]);
    }

    // Fetch names from Redis Hash (HMGET returns an array of values)
    const displayNames =
      userIds.length > 0 ? await this.redis.hmget(namesKey, ...userIds) : [];

    // Get Requesting User's Rank and Score
    const [userRank, userScore] = await Promise.all([
      this.redis.zrevrank(setKey, userId),
      this.redis.zscore(setKey, userId),
    ]);

    // Build DTOs
    const topRankings: LeaderboardEntryDto[] = userIds.map((id, index) => ({
      rank: startIndex + index + 1,
      userId: id,
      displayName: displayNames[index] || 'Anonymous',
      totalXlm: parseFloat(rawTopUsers[index * 2 + 1]),
      country: countryCode || 'Global',
    }));

    // Track response time for benchmarks
    const elapsed = performance.now() - startTime;
    this.totalResponseTimeMs+= elapsed;
    this.requestCount++;

    return {
      topRankings,
      myRank: {
        rank: userRank !== null ? userRank + 1 : null,
        totalXlm: userScore ? parseFloat(userScore) : 0,
      },
    };
  }

  async rebuildLeaderboards() {
    this.logger.log('Starting optimized leaderboard rebuild...');

    const periods = [
      LeaderboardPeriod.DAILY,
      LeaderboardPeriod.WEEKLY,
      LeaderboardPeriod.MONTHLY,
      LeaderboardPeriod.ALL_TIME,
    ];

    const pipeline = this.redis.pipeline();
    const nameMap: Record<string, string> = {};
    let totalUsersProcessed = 0;

    for (const period of periods) {
      const periodStart = getPeriodStartDate(period);
      const globalKey = buildLeaderboardSetKey(period);
      pipeline.del(globalKey);

      const queryBuilder = this.rewardTransactionRepository
        .createQueryBuilder('rt')
        .select('rt.userId', 'userId')
        .addSelect('SUM(rt.amount)', 'totalXlm')
        .addSelect('u.fullName', 'fullName')
        .addSelect('u.country', 'country')
        .addSelect('u.status', 'status')
        .innerJoin('rt.user', 'u')
        .where('rt.status = :status', { status: RewardStatus.SUCCESS })
        .andWhere('u.status = :userStatus', {
          userStatus: LeaderboardAccountStatus.ACTIVE,
        });

      if (periodStart) {
        queryBuilder.andWhere('rt.createdAt >= :periodStart', {
          periodStart,
        });
      }

      const data = await queryBuilder
        .groupBy('rt.userId')
        .addGroupBy('u.fullName')
        .addGroupBy('u.country')
        .addGroupBy('u.status')
        .getRawMany();

      totalUsersProcessed = Math.max(totalUsersProcessed, data.length);

      for (const row of data) {
        const score = parseFloat(row.totalXlm);
        if (!isEligibleForLeaderboard({ totalXlm: score, status: row.status })) {
          continue;
        }
        const truncatedName = this.formatDisplayName(row.fullName);
        const countryKey = buildLeaderboardSetKey(
          period,
          row.country?.toUpperCase(),
        );

        pipeline.zadd(globalKey, score, row.userId);
        pipeline.zadd(countryKey, score, row.userId);
        nameMap[row.userId] = truncatedName;
      }
    }

    await pipeline.exec();

    if (Object.keys(nameMap).length > 0) {
      await this.redis.hmset('leaderboard:metadata:names', nameMap);
    }

    this.logger.log(
      `Leaderboard rebuild complete: ${totalUsersProcessed} user rows processed`,
    );
  }
}