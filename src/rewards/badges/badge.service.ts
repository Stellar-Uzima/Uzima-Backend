import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Badge } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';
import { User } from '../../database/entities/user.entity';
import { BadgeType } from './enums/badge-type.enum';
import {
  UserBadgeDto,
  UserBadgesResponseDto,
  BadgeListResponseDto,
  BadgeDto,
} from './dto/badge.dto';
import { Streak } from '../../streaks/entities/streak.entity';
import { TaskCompletion } from '../../task-completion/entities/task-completion.entity';

@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);

  constructor(
    @InjectRepository(Badge)
    private readonly badgeRepository: Repository<Badge>,
    @InjectRepository(UserBadge)
    private readonly userBadgeRepository: Repository<UserBadge>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Streak)
    private readonly streakRepository: Repository<Streak>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /**
   * Initialize default badges in the system
   */
  async initializeBadges(): Promise<void> {
    const badgeCount = await this.badgeRepository.count();
    if (badgeCount > 0) {
      return;
    }

    const defaultBadges = [
      {
        name: 'First Step',
        type: BadgeType.FIRST_TASK,
        description: 'Complete your first health task',
        milestone: 1,
        milestoneType: 'task_completion',
        icon: '🎯',
        isActive: true,
      },
      {
        name: 'Week Warrior',
        type: BadgeType.STREAK_7_DAYS,
        description: 'Maintain a 7-day streak',
        milestone: 7,
        milestoneType: 'streak_days',
        icon: '🔥',
        isActive: true,
      },
      {
        name: 'Month Master',
        type: BadgeType.STREAK_30_DAYS,
        description: 'Maintain a 30-day streak',
        milestone: 30,
        milestoneType: 'streak_days',
        icon: '⭐',
        isActive: true,
      },
      {
        name: 'Century Champion',
        type: BadgeType.STREAK_100_DAYS,
        description: 'Maintain a 100-day streak',
        milestone: 100,
        milestoneType: 'streak_days',
        icon: '👑',
        isActive: true,
      },
      {
        name: 'Health Champion',
        type: BadgeType.HEALTH_CHAMPION,
        description: 'Complete 50 health tasks',
        milestone: 50,
        milestoneType: 'task_completion',
        icon: '🏆',
        isActive: true,
      },
    ];

    for (const badgeData of defaultBadges) {
      const badge = this.badgeRepository.create(badgeData);
      await this.badgeRepository.save(badge);
    }

    this.logger.log('Default badges initialized successfully');
  }

  /**
   * Check and award badges when a task is completed
   */
  @OnEvent('task.completed')
  async handleTaskCompleted(payload: { userId: string; taskId: string }) {
    await this.checkAndAwardBadges(payload.userId);
  }

  /**
   * Check and award badges when a streak milestone is reached
   */
  @OnEvent('streak.milestone')
  async handleStreakMilestone(payload: { userId: string; streakDays: number }) {
    await this.checkAndAwardBadges(payload.userId);
  }

  /**
   * Main logic to check milestones and award badges
   */
  async checkAndAwardBadges(userId: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        return;
      }

      // Get all active badges
      const badges = await this.badgeRepository.find({
        where: { isActive: true },
      });

      for (const badge of badges) {
        const hasAlreadyEarned = await this.userBadgeRepository.findOne({
          where: {
            userId,
            badgeId: badge.id,
          },
        });

        if (hasAlreadyEarned) {
          continue; // Skip if already earned
        }

        // Check if user meets the milestone criteria
        const meets = await this.checkMilestoneCriteria(userId, badge);
        if (meets) {
          await this.awardBadgeToUser(userId, badge.id);
        }
      }
    } catch (error) {
      this.logger.error(`Error checking and awarding badges for user ${userId}:`, error);
    }
  }

  /**
   * Check if user meets the milestone criteria for a specific badge
   */
  private async checkMilestoneCriteria(userId: string, badge: Badge): Promise<boolean> {
    if (badge.milestoneType === 'task_completion') {
      return this.checkTaskCompletionMilestone(userId, badge.milestone);
    } else if (badge.milestoneType === 'streak_days') {
      return this.checkStreakMilestone(userId, badge.milestone);
    }

    return false;
  }

  /**
   * Check if user has completed the required number of tasks
   */
  private async checkTaskCompletionMilestone(userId: string, milestone: number): Promise<boolean> {
    const completionCount = await this.taskCompletionRepository.count({
      where: {
        userId,
        isCompleted: true,
      },
    });

    return completionCount >= milestone;
  }

  /**
   * Check if user has achieved the required streak days
   */
  private async checkStreakMilestone(userId: string, milestone: number): Promise<boolean> {
    const streak = await this.streakRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!streak) {
      return false;
    }

    return streak.currentStreak >= milestone;
  }

  /**
   * Award a badge to a user
   */
  async awardBadgeToUser(userId: string, badgeId: string): Promise<UserBadge> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`User not found: ${userId}`);
      }

      const badge = await this.badgeRepository.findOne({ where: { id: badgeId } });
      if (!badge) {
        throw new NotFoundException(`Badge not found: ${badgeId}`);
      }

      // Check if already earned
      const existing = await this.userBadgeRepository.findOne({
        where: { userId, badgeId },
      });

      if (existing) {
        return existing;
      }

      const userBadge = this.userBadgeRepository.create({
        userId,
        badgeId,
        user,
        badge,
      });

      const saved = await this.userBadgeRepository.save(userBadge);
      this.logger.log(`Badge awarded to user ${userId}: ${badge.name}`);

      // Emit event for other services to react
      this.eventEmitter.emit('badge.awarded', {
        userId,
        badgeId,
        badgeName: badge.name,
      });

      return saved;
    } catch (error) {
      this.logger.error(`Error awarding badge to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all available badges
   */
  async getAllBadges(): Promise<BadgeListResponseDto> {
    const badges = await this.badgeRepository.find({
      where: { isActive: true },
    });

    return {
      badges: badges.map(this.mapBadgeToDto),
      totalBadges: badges.length,
    };
  }

  /**
   * Get badges earned by a specific user
   */
  async getUserBadges(userId: string): Promise<UserBadgesResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const userBadges = await this.userBadgeRepository.find({
      where: { userId },
      relations: ['badge'],
      order: { awardedAt: 'DESC' },
    });

    return {
      userId,
      badges: userBadges.map((ub) => this.mapUserBadgeToDto(ub)),
      totalBadges: userBadges.length,
    };
  }

  /**
   * Get a specific badge by ID
   */
  async getBadgeById(badgeId: string): Promise<BadgeDto> {
    const badge = await this.badgeRepository.findOne({ where: { id: badgeId } });
    if (!badge) {
      throw new NotFoundException(`Badge not found: ${badgeId}`);
    }

    return this.mapBadgeToDto(badge);
  }

  /**
   * Check if a user has earned a specific badge
   */
  async userHasEarnedBadge(userId: string, badgeId: string): Promise<boolean> {
    const userBadge = await this.userBadgeRepository.findOne({
      where: { userId, badgeId },
    });

    return !!userBadge;
  }

  /**
   * Map Badge entity to DTO
   */
  private mapBadgeToDto(badge: Badge): BadgeDto {
    return {
      id: badge.id,
      name: badge.name,
      type: badge.type,
      description: badge.description,
      icon: badge.icon,
      milestone: badge.milestone,
      milestoneType: badge.milestoneType,
      isActive: badge.isActive,
    };
  }

  /**
   * Map UserBadge entity to DTO
   */
  private mapUserBadgeToDto(userBadge: UserBadge): UserBadgeDto {
    return {
      id: userBadge.id,
      badgeId: userBadge.badge.id,
      badgeName: userBadge.badge.name,
      badgeType: userBadge.badge.type,
      badgeDescription: userBadge.badge.description,
      badgeIcon: userBadge.badge.icon,
      badgeMilestone: userBadge.badge.milestone,
      awardedAt: userBadge.awardedAt.toISOString(),
    };
  }
}
