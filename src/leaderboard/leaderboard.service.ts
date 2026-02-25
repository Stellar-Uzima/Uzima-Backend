import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import Redis from 'ioredis';
import {
  RewardTransaction,
  RewardStatus,
} from '../rewards/entities/reward-transaction.entity';
import {
  LeaderboardResponseDto,
  LeaderboardEntryDto,
} from './dto/leaderboard.dto';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private redis: Redis;

  constructor(
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.redis = (this.cacheManager.stores as any).client;
  }

  private formatDisplayName(fullName: string): string {
    const parts = fullName.trim().split(' ');
    if (parts.length <= 1) return fullName;
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    return `${firstName} ${lastName.charAt(0)}.`;
  }

  async getLeaderboard(
    userId: string,
    limit: number = 50,
    countryCode?: string,
  ): Promise<LeaderboardResponseDto> {
    const setKey = countryCode
      ? `leaderboard:country:${countryCode.toUpperCase()}`
      : `leaderboard:global`;
    const namesKey = `leaderboard:metadata:names`;

    // Get Top N IDs and Scores from the Sorted Set
    const rawTopUsers = await this.redis.zrevrange(
      setKey,
      0,
      limit - 1,
      'WITHSCORES',
    );

    // Extract IDs to fetch names from our Hash in one go
    const userIds = [];
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
      rank: index + 1,
      userId: id,
      displayName: displayNames[index] || 'Anonymous',
      totalXlm: parseFloat(rawTopUsers[index * 2 + 1]),
      country: countryCode || 'Global',
    }));

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
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get all transactions grouped by user with their names and countries
    const data = await this.rewardRepo
      .createQueryBuilder('rt')
      .select('rt.userId', 'userId')
      .addSelect('SUM(rt.amount)', 'totalXlm')
      .addSelect('u.fullName', 'fullName')
      .addSelect('u.country', 'country')
      .innerJoin('rt.user', 'u')
      .where('rt.status = :status', { status: RewardStatus.COMPLETED })
      .andWhere('rt.createdAt >= :startOfMonth', { startOfMonth })
      .groupBy('rt.userId')
      .addGroupBy('u.fullName')
      .addGroupBy('u.country')
      .getRawMany();

    const pipeline = this.redis.pipeline();

    // Clear previous month/day keys to avoid stale data
    pipeline.del('leaderboard:global');

    const nameMap: Record<string, string> = {};

    for (const row of data) {
      const score = parseFloat(row.totalXlm);
      const truncatedName = this.formatDisplayName(row.fullName);

      // Add to Global Set
      pipeline.zadd('leaderboard:global', score, row.userId);
      // Add to Country Set
      pipeline.zadd(
        `leaderboard:country:${row.country.toUpperCase()}`,
        score,
        row.userId,
      );

      nameMap[row.userId] = truncatedName;
    }

    // Update the Metadata Hash (Overwrites existing, adds new)
    if (Object.keys(nameMap).length > 0) {
      pipeline.hmset('leaderboard:metadata:names', nameMap);
    }

    await pipeline.exec();
    this.logger.log(
      `Leaderboard rebuild complete. Processed ${data.length} users.`,
    );
  }
}
