import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { HealthTask, TaskCategory } from '../../tasks/entities/health-task.entity';

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ResolveDateRangeOptions {
  period?: AnalyticsPeriod;
  startDate?: Date;
  endDate?: Date;
}

export interface CategoryBreakdownEntry {
  category: TaskCategory | 'uncategorized';
  totalAttempted: number;
  totalCompleted: number;
  completionRate: number;
}

export interface TaskAnalyticsStats {
  period: AnalyticsPeriod;
  startDate: Date;
  endDate: Date;
  totalAttempted: number;
  totalCompleted: number;
  completionRate: number;
  categoryBreakdown: CategoryBreakdownEntry[];
}

export interface GetStatsOptions extends ResolveDateRangeOptions {
  userId?: string;
}

const PERIOD_DAYS: Record<Exclude<AnalyticsPeriod, 'custom'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

@Injectable()
export class TaskAnalyticsService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>
  ) {}

  calculateCompletionRate(totalCompleted: number, totalAttempted: number): number {
    if (totalAttempted <= 0) {
      return 0;
    }
    return Math.round((totalCompleted / totalAttempted) * 10000) / 100;
  }

  resolveDateRange(options: ResolveDateRangeOptions = {}): {
    startDate: Date;
    endDate: Date;
  } {
    const period = options.period ?? 'weekly';
    const endDate = options.endDate ?? new Date();

    let startDate = options.startDate;
    if (!startDate && period !== 'custom') {
      startDate = new Date(endDate.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
    }
    if (!startDate) {
      startDate = new Date(endDate.getTime() - PERIOD_DAYS.weekly * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  async getStats(options: GetStatsOptions = {}): Promise<TaskAnalyticsStats> {
    const period: AnalyticsPeriod = options.period ?? 'weekly';
    const { startDate, endDate } = this.resolveDateRange(options);

    const rangeWhere: FindOptionsWhere<TaskCompletion> = {
      createdAt: Between(startDate, endDate),
    };

    const attemptedWhere: FindOptionsWhere<TaskCompletion> = options.userId
      ? { ...rangeWhere, userId: options.userId }
      : { ...rangeWhere };

    const completedWhere: FindOptionsWhere<TaskCompletion> = options.userId
      ? { ...attemptedWhere, isCompleted: true }
      : { ...attemptedWhere, isCompleted: true };

    const totalAttempted = await this.completionRepo.count({
      where: attemptedWhere,
    });

    const totalCompleted = await this.completionRepo.count({
      where: completedWhere,
    });

    const categoryBreakdown = await this.getCategoryBreakdown(startDate, endDate, options.userId);

    return {
      period,
      startDate,
      endDate,
      totalAttempted,
      totalCompleted,
      completionRate: this.calculateCompletionRate(totalCompleted, totalAttempted),
      categoryBreakdown,
    };
  }

  async getCategoryBreakdown(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<CategoryBreakdownEntry[]> {
    const qb = this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.category', 'category')
      .addSelect('COUNT(completion.id)', 'totalAttempted')
      .addSelect(
        'SUM(CASE WHEN completion.isCompleted = :isCompleted THEN 1 ELSE 0 END)',
        'totalCompleted'
      )
      .where('completion.createdAt BETWEEN :startDate AND :endDate')
      .setParameter('startDate', startDate)
      .setParameter('endDate', endDate)
      .setParameter('isCompleted', true)
      .groupBy('task.category');

    if (userId) {
      qb.andWhere('completion.userId = :userId', { userId });
    }

    const rawRows = await qb.getRawMany<{
      category: TaskCategory | null;
      totalAttempted: string;
      totalCompleted: string | null;
    }>();

    const categoryBreakdown: CategoryBreakdownEntry[] = rawRows.map((row) => {
      const attempted = Number(row.totalAttempted);
      const completed = Number(row.totalCompleted ?? 0);
      return {
        category: row.category ?? 'uncategorized',
        totalAttempted: attempted,
        totalCompleted: completed,
        completionRate: this.calculateCompletionRate(completed, attempted),
      };
    });

    return categoryBreakdown;
  }

  async getWeeklyStats(userId?: string): Promise<TaskAnalyticsStats> {
    return this.getStats({ period: 'weekly', userId });
  }

  async getDailyStats(userId?: string): Promise<TaskAnalyticsStats> {
    return this.getStats({ period: 'daily', userId });
  }
}
