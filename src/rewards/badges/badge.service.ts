 feat/all-issues-ghost
import { Injectable, Logger } from '@nestjs/common';
import { BadgeType } from './badge-type.enum';

export interface UserBadge {
  userId: string;
  badgeType: BadgeType;
  awardedAt: Date;
}

@Injectable()
export class BadgeService {
  private readonly logger = new Logger(BadgeService.name);
  private readonly userBadges = new Map<string, Set<BadgeType>>();

  /**
   * Award a badge to a user.
   * Returns true if the badge was newly awarded, false if already owned.
   * Throws an error for invalid badge types.
   */
  awardBadge(userId: string, badgeType: BadgeType): boolean {
    // Validate badge type
    const validBadgeTypes = Object.values(BadgeType);
    if (!validBadgeTypes.includes(badgeType)) {
      throw new Error(`Invalid badge type: ${badgeType}`);
    }

    // Initialize user badge set if not exists
    if (!this.userBadges.has(userId)) {
      this.userBadges.set(userId, new Set());
    }

    const userBadges = this.userBadges.get(userId)!;

    // Check for duplicate
    if (userBadges.has(badgeType)) {
      this.logger.warn(
        `User ${userId} already has badge ${badgeType} - skipping duplicate award`,
      );
      return false;
    }

    // Award the badge
    userBadges.add(badgeType);
    this.logger.log(`Awarded badge ${badgeType} to user ${userId}`);
    return true;
  }

  /**
   * Get all badges for a user.
   */
  getUserBadges(userId: string): BadgeType[] {
    const badges = this.userBadges.get(userId);
    return badges ? Array.from(badges) : [];
  }

  /**
   * Check if a user has a specific badge.
   */
  hasBadge(userId: string, badgeType: BadgeType): boolean {
    const badges = this.userBadges.get(userId);
    return badges ? badges.has(badgeType) : false;

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Badge, BadgeType } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';

const BADGE_DEFINITIONS = [
  { type: BadgeType.FIRST_TASK, name: 'First Step', description: 'Completed your first health task', iconUrl: '/badges/first-task.svg' },
  { type: BadgeType.STREAK_7, name: '7-Day Streak', description: 'Maintained a 7-day task streak', iconUrl: '/badges/streak-7.svg' },
  { type: BadgeType.STREAK_30, name: '30-Day Streak', description: 'Maintained a 30-day task streak', iconUrl: '/badges/streak-30.svg' },
  { type: BadgeType.TASKS_10, name: 'Dedicated', description: 'Completed 10 health tasks', iconUrl: '/badges/tasks-10.svg' },
  { type: BadgeType.TASKS_50, name: 'Committed', description: 'Completed 50 health tasks', iconUrl: '/badges/tasks-50.svg' },
  { type: BadgeType.TASKS_100, name: 'Champion', description: 'Completed 100 health tasks', iconUrl: '/badges/tasks-100.svg' },
];

@Injectable()
export class BadgeService {
  constructor(
    @InjectRepository(Badge) private readonly badgeRepository: Repository<Badge>,
    @InjectRepository(UserBadge) private readonly userBadgeRepository: Repository<UserBadge>,
  ) {}

  async getAllBadges(): Promise<Badge[]> { return this.badgeRepository.find(); }

  async getUserBadges(userId: string): Promise<UserBadge[]> {
    return this.userBadgeRepository.find({ where: { userId } });
  }

  async awardBadge(userId: string, badgeType: BadgeType): Promise<UserBadge | null> {
    const badge = await this.badgeRepository.findOne({ where: { type: badgeType } });
    if (!badge) return null;
    const existing = await this.userBadgeRepository.findOne({ where: { userId, badgeId: badge.id } });
    if (existing) return existing;
    return this.userBadgeRepository.save(this.userBadgeRepository.create({ userId, badgeId: badge.id }));
  }

  async checkAndAwardMilestones(userId: string, completedTaskCount: number, currentStreak: number): Promise<void> {
    if (completedTaskCount === 1) await this.awardBadge(userId, BadgeType.FIRST_TASK);
    if (completedTaskCount >= 10) await this.awardBadge(userId, BadgeType.TASKS_10);
    if (completedTaskCount >= 50) await this.awardBadge(userId, BadgeType.TASKS_50);
    if (completedTaskCount >= 100) await this.awardBadge(userId, BadgeType.TASKS_100);
    if (currentStreak >= 7) await this.awardBadge(userId, BadgeType.STREAK_7);
    if (currentStreak >= 30) await this.awardBadge(userId, BadgeType.STREAK_30);
 main
  }
}