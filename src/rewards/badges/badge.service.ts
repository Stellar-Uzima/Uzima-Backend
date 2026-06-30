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
  }
}