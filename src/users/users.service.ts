import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { createClient, RedisClientType } from 'redis';
import { User } from '../entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserStatsDto } from './dto/user-stats.dto';
import { TaskCompletion } from './entities/task-completion.entity';
import { Coupon, CouponStatus } from './entities/coupon.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private redisClient: RedisClientType;
  private readonly CACHE_TTL = 300; // 5 minutes in seconds

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
  ) {
    // Initialize Redis client
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect().catch((err) => {
      this.logger.warn('Failed to connect to Redis, caching disabled:', err.message);
    });
  }

  async onModuleInit() {
    // Module initialization
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  /**
   * Get user profile by ID
   * Returns serialized UserResponseDto with password excluded
   */
  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Use plainToInstance to serialize user data with @Exclude/@Expose decorators
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Update user profile
   * Uses whitelist: true to strip undefined properties
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only provided fields (whitelist behavior is handled by DTO validation)
    Object.assign(user, updateProfileDto);

    const updatedUser = await this.userRepository.save(user);

    this.logger.log(`User profile updated: ${userId}`);

    // Return serialized response
    return plainToInstance(UserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Soft delete user account
   * Sets isActive to false and anonymizes email
   */
  async softDelete(userId: string): Promise<void> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete: set isActive to false
    user.isActive = false;

    // Anonymize email to allow re-registration with same email
    const anonymizedEmail = `deleted_${userId}_${Date.now()}@deleted.user`;
    user.email = anonymizedEmail;

    // Also anonymize phone number if exists
    if (user.phoneNumber) {
      user.phoneNumber = `deleted_${userId}_${Date.now()}`;
    }

    await this.userRepository.save(user);

    this.logger.log(`User account soft deleted: ${userId}`);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  /**
   * Find user by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phoneNumber },
    });
  }

  /**
   * Create a new user
   */
  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  /**
   * Get aggregated user stats with Redis caching
   * Uses TypeORM QueryBuilder with COUNT and SUM aggregate functions
   */
  async getStats(userId: string): Promise<UserStatsDto> {
    const cacheKey = `stats:${userId}`;

    // Try to get from cache first
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for stats:${userId}`);
        return JSON.parse(cached) as UserStatsDto;
      }
    } catch (error) {
      this.logger.warn(`Redis cache read error: ${error.message}`);
    }

    // Get tasks completed count and total XLM earned using QueryBuilder
    const taskStats = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('COUNT(*)', 'tasksCompleted')
      .addSelect('COALESCE(SUM(tc.rewardXlm), 0)', 'totalXlmEarned')
      .where('tc.userId = :userId', { userId })
      .getRawOne();

    // Get active coupons count
    const activeCouponsResult = await this.couponRepository
      .createQueryBuilder('c')
      .select('COUNT(*)', 'activeCoupons')
      .where('c.userId = :userId', { userId })
      .andWhere('c.status = :status', { status: CouponStatus.ACTIVE })
      .andWhere('c.expiresAt > :now OR c.expiresAt IS NULL', { now: new Date() })
      .getRawOne();

    // Calculate streaks
    const { currentStreak, longestStreak } = await this.calculateStreaks(userId);

    // Calculate rank (based on total XLM earned)
    const rank = await this.calculateRank(userId, parseFloat(taskStats.totalXlmEarned || '0'));

    const stats: UserStatsDto = {
      tasksCompleted: parseInt(taskStats.tasksCompleted || '0', 10),
      totalXlmEarned: parseFloat(taskStats.totalXlmEarned || '0'),
      currentStreak,
      longestStreak,
      activeCoupons: parseInt(activeCouponsResult.activeCoupons || '0', 10),
      rank,
    };

    // Cache the result
    try {
      await this.redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(stats));
      this.logger.debug(`Cached stats for user:${userId}`);
    } catch (error) {
      this.logger.warn(`Redis cache write error: ${error.message}`);
    }

    return stats;
  }

  /**
   * Calculate current and longest streaks
   */
  private async calculateStreaks(userId: string): Promise<{ currentStreak: number; longestStreak: number }> {
    // Get all task completions ordered by date descending
    const completions = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('DATE(tc.completedAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('tc.userId = :userId', { userId })
      .groupBy('DATE(tc.completedAt)')
      .orderBy('date', 'DESC')
      .getRawMany();

    if (completions.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let isCurrentStreak = true;

    // Parse dates and check streaks
    const completionDates = completions.map((c) => {
      const date = new Date(c.date);
      date.setHours(0, 0, 0, 0);
      return date;
    });

    // Check if there's a completion today or yesterday for current streak
    const latestDate = completionDates[0];
    const daysDiffFromToday = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiffFromToday <= 1) {
      // Count consecutive days
      let previousDate: Date | null = null;
      for (const date of completionDates) {
        if (previousDate === null) {
          tempStreak = 1;
          previousDate = date;
        } else {
          const diff = Math.floor((previousDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (diff === 1) {
            tempStreak++;
          } else {
            if (isCurrentStreak) {
              currentStreak = tempStreak;
              isCurrentStreak = false;
            }
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
          previousDate = date;
        }
      }
      if (isCurrentStreak) {
        currentStreak = tempStreak;
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    return { currentStreak, longestStreak };
  }

  /**
   * Calculate user rank based on total XLM earned
   */
  private async calculateRank(userId: string, userXlm: number): Promise<number> {
    if (userXlm <= 0) {
      return 0;
    }

    // Count users with more XLM than this user
    const higherRankedCount = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('tc.userId', 'userId')
      .addSelect('SUM(tc.rewardXlm)', 'totalXlm')
      .groupBy('tc.userId')
      .having('SUM(tc.rewardXlm) > :userXlm', { userXlm })
      .getRawMany();

    return higherRankedCount.length + 1;
  }

  /**
   * Invalidate stats cache for a user
   */
  async invalidateStatsCache(userId: string): Promise<void> {
    const cacheKey = `stats:${userId}`;
    try {
      await this.redisClient.del(cacheKey);
      this.logger.debug(`Invalidated cache for stats:${userId}`);
    } catch (error) {
      this.logger.warn(`Redis cache invalidation error: ${error.message}`);
    }
  }
}
