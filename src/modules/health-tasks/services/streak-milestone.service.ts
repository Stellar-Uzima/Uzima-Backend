import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface MilestoneReachedEvent {
  userId: string;
  milestoneDays: number;
}

@Injectable()
export class StreakMilestoneService {
  private readonly logger = new Logger(StreakMilestoneService.name);
  private readonly MILESTONES = [7, 30, 100];

  // Track reached milestones per user to avoid duplicate emissions
  private readonly reachedMilestones = new Map<string, Set<number>>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Check if user has crossed any milestones with their new streak value
   * and emit events for newly crossed milestones only.
   *
   * @param userId - The user's ID
   * @param currentStreak - The user's current streak count
   */
  checkAndEmit(userId: string, currentStreak: number): void {
    // Initialize milestone tracking for user if not exists
    if (!this.reachedMilestones.has(userId)) {
      this.reachedMilestones.set(userId, new Set());
    }

    const userMilestones = this.reachedMilestones.get(userId)!;

    // Check each configured milestone
    for (const milestone of this.MILESTONES) {
      // If streak reached or exceeded milestone AND milestone not yet recorded
      if (currentStreak >= milestone && !userMilestones.has(milestone)) {
        this.emitMilestoneEvent(userId, milestone);
        userMilestones.add(milestone);
      }
    }
  }

  private emitMilestoneEvent(userId: string, milestoneDays: number): void {
    this.logger.log(
      `Emitting milestone event for user ${userId} at ${milestoneDays} days.`,
    );

    // Emit domain-specific event
    this.eventEmitter.emit('streak.milestone.reached', {
      userId,
      milestoneDays,
    });

    // Emit reward event for compatibility with existing reward handling
    this.eventEmitter.emit('reward.milestone', {
      userId,
      milestoneReached: milestoneDays,
    });
  }

  /**
   * Reset milestone tracking for a user.
   * Primarily used for testing or admin correction purposes.
   *
   * @param userId - The user's ID
   */
  resetUserMilestones(userId: string): void {
    this.reachedMilestones.delete(userId);
  }

  /**
   * Get all reached milestones for a user.
   * Useful for diagnostics.
   */
  getUserReachedMilestones(userId: string): number[] {
    const milestones = this.reachedMilestones.get(userId);
    return milestones ? Array.from(milestones).sort((a, b) => a - b) : [];
  }
}