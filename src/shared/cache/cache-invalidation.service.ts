import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Events that trigger cache invalidation
 */
export enum CacheInvalidationEvent {
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  TASK_CREATED = 'task.created',
  TASK_UPDATED = 'task.updated',
  TASK_DELETED = 'task.deleted',
  TASK_COMPLETED = 'task.completed',
  LEADERBOARD_UPDATED = 'leaderboard.updated',
  HEALTH_PROFILE_UPDATED = 'health-profile.updated',
  REWARD_GRANTED = 'reward.granted',
  REFERRAL_USED = 'referral.used',
}

/**
 * Service for managing cache invalidation strategies
 * tied to data update events.
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // User-related invalidations
    this.eventEmitter.on(CacheInvalidationEvent.USER_UPDATED, (data) => {
      this.invalidateUserCache(data.userId);
    });

    this.eventEmitter.on(CacheInvalidationEvent.USER_DELETED, (data) => {
      this.invalidateUserCache(data.userId);
    });

    // Task-related invalidations
    this.eventEmitter.on(CacheInvalidationEvent.TASK_CREATED, (data) => {
      this.invalidateTaskCache(data.userId);
    });

    this.eventEmitter.on(CacheInvalidationEvent.TASK_UPDATED, (data) => {
      this.invalidateTaskCache(data.userId);
      this.invalidateTaskDetail(data.taskId);
    });

    this.eventEmitter.on(CacheInvalidationEvent.TASK_DELETED, (data) => {
      this.invalidateTaskCache(data.userId);
      this.invalidateTaskDetail(data.taskId);
    });

    this.eventEmitter.on(CacheInvalidationEvent.TASK_COMPLETED, (data) => {
      this.invalidateTaskCache(data.userId);
      this.invalidateTaskDetail(data.taskId);
      this.invalidateLeaderboardCache();
    });

    // Leaderboard invalidations
    this.eventEmitter.on(CacheInvalidationEvent.LEADERBOARD_UPDATED, () => {
      this.invalidateLeaderboardCache();
    });

    // Health profile invalidations
    this.eventEmitter.on(CacheInvalidationEvent.HEALTH_PROFILE_UPDATED, (data) => {
      this.invalidateHealthProfileCache(data.userId);
    });

    // Reward invalidations
    this.eventEmitter.on(CacheInvalidationEvent.REWARD_GRANTED, (data) => {
      this.invalidateUserCache(data.userId);
      this.invalidateLeaderboardCache();
    });

    // Referral invalidations
    this.eventEmitter.on(CacheInvalidationEvent.REFERRAL_USED, (data) => {
      this.invalidateUserCache(data.userId);
      this.invalidateUserCache(data.referrerId);
    });
  }

  /**
   * Invalidate all cache entries for a specific user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const patterns = [
        `user:${userId}:*`,
        `user:profile:${userId}`,
        `user:activity:${userId}:*`,
        `tasks:user:${userId}:*`,
        `health-profile:${userId}:*`,
      ];

      for (const pattern of patterns) {
        const count = await this.cacheService.clearPattern(pattern);
        if (count > 0) {
          this.logger.debug(
            `Invalidated ${count} cache entries for user ${userId} with pattern: ${pattern}`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate user cache for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Invalidate task-related cache entries
   */
  async invalidateTaskCache(userId: string): Promise<void> {
    try {
      const patterns = [`tasks:user:${userId}:*`, `tasks:list:${userId}:*`];

      for (const pattern of patterns) {
        const count = await this.cacheService.clearPattern(pattern);
        if (count > 0) {
          this.logger.debug(`Invalidated ${count} task cache entries for user ${userId}`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate task cache for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Invalidate specific task detail cache
   */
  async invalidateTaskDetail(taskId: string): Promise<void> {
    try {
      await this.cacheService.del(`task:${taskId}`);
      await this.cacheService.clearPattern(`task:${taskId}:*`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate task detail cache for ${taskId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Invalidate all leaderboard cache entries
   */
  async invalidateLeaderboardCache(): Promise<void> {
    try {
      const count = await this.cacheService.invalidateLeaderboardCache('leaderboard:*');
      this.logger.log(`Invalidated ${count} leaderboard cache entries`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate leaderboard cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Invalidate health profile cache entries
   */
  async invalidateHealthProfileCache(userId: string): Promise<void> {
    try {
      const patterns = [`health-profile:${userId}:*`, `health-tasks:user:${userId}:*`];

      for (const pattern of patterns) {
        const count = await this.cacheService.clearPattern(pattern);
        if (count > 0) {
          this.logger.debug(`Invalidated ${count} health profile cache entries for user ${userId}`);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to invalidate health profile cache for user ${userId}: ${error.message}`
        );
      } else {
        this.logger.error(
          `Failed to invalidate health profile cache for user ${userId}: ${String(error)}`
        );
      }
    }
  }

  /**
   * Emit a cache invalidation event
   */
  emitEvent(event: CacheInvalidationEvent, data: any): void {
    this.eventEmitter.emit(event, data);
  }

  /**
   * Bulk invalidate by multiple patterns
   */
  async invalidatePatterns(patterns: string[]): Promise<number> {
    let totalInvalidated = 0;
    for (const pattern of patterns) {
      try {
        const count = await this.cacheService.clearPattern(pattern);
        totalInvalidated += count;
      } catch (error) {
        this.logger.error(
          `Failed to invalidate pattern ${pattern}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return totalInvalidated;
  }
}
