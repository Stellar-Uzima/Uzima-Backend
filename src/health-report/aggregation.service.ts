import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskCompletion } from '../tasks/entities/task-completion.entity';
import { TaskCategory } from '../tasks/entities/health-task.entity';
import { Consultation } from '../modules/consultations/entities/consultation.entity';

export interface CategoryCompletionStat {
  category: string;
  assigned: number;
  completed: number;
  completionRate: number;
}

export interface StreakSummary {
  currentStreak: number;
  longestStreakInPeriod: number;
}

export interface BadgeEarned {
  name: string;
  description: string;
  earnedAt: string;
}

export interface ConsultationSummary {
  totalScheduled: number;
  completed: number;
  cancelled: number;
}

export interface ReportAggregation {
  userId: string;
  periodStart: string;
  periodEnd: string;
  categoryStats: CategoryCompletionStat[];
  overallCompletionRate: number;
  streak: StreakSummary;
  badgesEarned: BadgeEarned[];
  consultations: ConsultationSummary;
  insight: string;
}

const STREAK_MILESTONES = [7, 14, 30, 60, 100];
const COMPLETION_COUNT_MILESTONES = [10, 25, 50, 100];

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(Consultation)
    private readonly consultationRepo: Repository<Consultation>
  ) {}

  async aggregateForUser(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ReportAggregation> {
    const [categoryStats, streak, badges, consultations] = await Promise.all([
      this.getCategoryStats(userId, periodStart, periodEnd),
      this.getStreakSummary(userId, periodEnd),
      this.getBadgesEarned(userId, periodEnd),
      this.getConsultationSummary(userId, periodStart, periodEnd),
    ]);

    const totalAssigned = categoryStats.reduce((sum, c) => sum + c.assigned, 0);
    const totalCompleted = categoryStats.reduce((sum, c) => sum + c.completed, 0);
    const overallCompletionRate =
      totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 10000) / 100 : 0;

    const insight = this.buildInsight(categoryStats, streak, overallCompletionRate);

    return {
      userId,
      periodStart: this.toDateString(periodStart),
      periodEnd: this.toDateString(periodEnd),
      categoryStats,
      overallCompletionRate,
      streak,
      badgesEarned: badges,
      consultations,
      insight,
    };
  }

  private async getCategoryStats(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<CategoryCompletionStat[]> {
    const completions = await this.completionRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.task', 'task')
      .where('c.userId = :userId', { userId })
      .andWhere('c.createdAt >= :periodStart', { periodStart })
      .andWhere('c.createdAt <= :periodEnd', { periodEnd })
      .getMany();

    const byCategory = new Map<string, { assigned: number; completed: number }>();

    for (const category of Object.values(TaskCategory)) {
      byCategory.set(category, { assigned: 0, completed: 0 });
    }

    for (const completion of completions) {
      const category = completion.task?.category ?? 'uncategorized';
      if (!byCategory.has(category)) {
        byCategory.set(category, { assigned: 0, completed: 0 });
      }
      const bucket = byCategory.get(category)!;
      bucket.assigned += 1;
      if (completion.isCompleted) {
        bucket.completed += 1;
      }
    }

    return Array.from(byCategory.entries())
      .filter(([, stats]) => stats.assigned > 0)
      .map(([category, stats]) => ({
        category,
        assigned: stats.assigned,
        completed: stats.completed,
        completionRate:
          stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 10000) / 100 : 0,
      }));
  }

  /**
   * Streak is derived directly from TaskCompletion.completedAt dates rather than
   * the Streak entity/StreaksModule, which are not wired into app.module.ts in
   * the current codebase (see PR description). Mirrors the day-gap approach
   * already used in HealthTasksModule's CompletionService.calculateStreaks,
   * with a 90-day lookback so "current streak" is accurate even when the
   * report period itself is short.
   */
  private async getStreakSummary(userId: string, periodEnd: Date): Promise<StreakSummary> {
    const lookbackStart = new Date(periodEnd);
    lookbackStart.setDate(lookbackStart.getDate() - 90);

    const completions = await this.completionRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.isCompleted = true')
      .andWhere('c.completedAt IS NOT NULL')
      .andWhere('c.completedAt >= :lookbackStart', { lookbackStart })
      .andWhere('c.completedAt <= :periodEnd', { periodEnd })
      .getMany();

    const completedDays = new Set(
      completions.filter((c) => c.completedAt).map((c) => this.toDateString(c.completedAt as Date))
    );

    const sortedDays = Array.from(completedDays).sort();

    let longestStreakInPeriod = 0;
    let runningStreak = 0;
    let previousDate: Date | null = null;

    for (const dayStr of sortedDays) {
      const currentDate = new Date(dayStr + 'T00:00:00Z');
      if (previousDate && currentDate.getTime() - previousDate.getTime() === 24 * 60 * 60 * 1000) {
        runningStreak += 1;
      } else {
        runningStreak = 1;
      }
      longestStreakInPeriod = Math.max(longestStreakInPeriod, runningStreak);
      previousDate = currentDate;
    }

    let currentStreak = 0;
    const cursor = new Date(this.toDateString(periodEnd) + 'T00:00:00Z');
    while (completedDays.has(this.toDateString(cursor))) {
      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return { currentStreak, longestStreakInPeriod };
  }

  /**
   * Badges are computed on the fly from streak milestones and completion-count
   * tiers rather than persisted, since no badges module/entity exists in the
   * codebase. See PR description for scope rationale.
   */
  private async getBadgesEarned(userId: string, periodEnd: Date): Promise<BadgeEarned[]> {
    const badges: BadgeEarned[] = [];

    const { currentStreak } = await this.getStreakSummary(userId, periodEnd);
    for (const milestone of STREAK_MILESTONES) {
      if (currentStreak >= milestone) {
        badges.push({
          name: `${milestone}-Day Streak`,
          description: `Completed health tasks ${milestone} days in a row`,
          earnedAt: this.toDateString(periodEnd),
        });
      }
    }

    const totalCompletedAllTime = await this.completionRepo.count({
      where: { userId, isCompleted: true },
    });
    for (const milestone of COMPLETION_COUNT_MILESTONES) {
      if (totalCompletedAllTime >= milestone) {
        badges.push({
          name: `${milestone} Tasks Completed`,
          description: `Completed ${milestone} health tasks total`,
          earnedAt: this.toDateString(periodEnd),
        });
      }
    }

    return badges;
  }

  private async getConsultationSummary(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<ConsultationSummary> {
    const consultations = await this.consultationRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.scheduledAt >= :periodStart', { periodStart })
      .andWhere('c.scheduledAt <= :periodEnd', { periodEnd })
      .getMany();

    return {
      totalScheduled: consultations.length,
      completed: consultations.filter((c) => !c.cancelled).length,
      cancelled: consultations.filter((c) => c.cancelled).length,
    };
  }

  private buildInsight(
    categoryStats: CategoryCompletionStat[],
    streak: StreakSummary,
    overallCompletionRate: number
  ): string {
    if (categoryStats.length === 0) {
      return "You didn't complete any tasks this week \u2014 let's aim for at least one next week!";
    }

    const best = [...categoryStats].sort((a, b) => b.completionRate - a.completionRate)[0];
    const worst = [...categoryStats].sort((a, b) => a.completionRate - b.completionRate)[0];

    if (streak.currentStreak >= 7) {
      return `You're on a ${streak.currentStreak}-day streak! Your strongest category was ${best.category} at ${best.completionRate}% completion.`;
    }

    if (overallCompletionRate >= 80) {
      return `Great week! You completed ${overallCompletionRate}% of your tasks, led by ${best.category}.`;
    }

    if (worst.completionRate < 50) {
      return `Your best category this week was ${best.category}. ${worst.category} could use more attention \u2014 you completed ${worst.completionRate}% there.`;
    }

    return `You completed ${overallCompletionRate}% of your tasks this week, with ${best.category} leading the way.`;
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}

