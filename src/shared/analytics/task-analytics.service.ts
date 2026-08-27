import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TaskCompletion,
  TaskCompletionStatus,
} from '../../tasks/entities/task-completion.entity';
import { HealthTask, TaskCategory } from '../../tasks/entities/health-task.entity';

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface AnalyticsQueryOptions {
  period?: AnalyticsPeriod;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
}

export interface CategoryBreakdown {
  category: TaskCategory | string;
  totalAttempted: number;
  totalCompleted: number;
  completionRate: number;
}

export interface TaskAnalyticsStats {
  period: AnalyticsPeriod;
  totalAttempted: number;
  totalCompleted: number;
  completionRate: number;
  categoryBreakdown: CategoryBreakdown[];
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
}

@Injectable()
export class TaskAnalyticsService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
  ) {}

  public calculateCompletionRate(totalCompleted: number, totalAttempted: number): number {
    if (!totalAttempted || totalAttempted <= 0) {
      return 0;
    }
    const rate = (totalCompleted / totalAttempted) * 100;
    return Number(rate.toFixed(2));
  }

  public resolveDateRange(options: {
    period?: AnalyticsPeriod;
    startDate?: Date;
    endDate?: Date;
  }): { startDate: Date; endDate: Date } {
    const endDate = options.endDate ? new Date(options.endDate) : new Date();
    let startDate: Date;

    if (options.startDate) {
      startDate = new Date(options.startDate);
    } else if (options.period === 'daily') {
      startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    } else if (options.period === 'monthly') {
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      // Default to weekly
      startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  public async getCategoryBreakdown(
    startDate: Date,
    endDate: Date,
    userId?: string,
  ): Promise<CategoryBreakdown[]> {
    const qb = this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.category', 'category')
      .addSelect('COUNT(completion.id)', 'totalAttempted')
      .addSelect(
        "SUM(CASE WHEN completion.status = 'COMPLETED' THEN 1 ELSE 0 END)",
        'totalCompleted',
      )
      .where('completion.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (userId) {
      qb.andWhere('completion.userId = :userId', { userId });
    }

    qb.groupBy('task.category');

    const rawResults = await qb.getRawMany();

    return rawResults.map((row): CategoryBreakdown => {
      const category = row.category || 'uncategorized';
      const totalAttempted = parseInt(row.totalAttempted, 10) || 0;
      const totalCompleted = parseInt(row.totalCompleted, 10) || 0;
      const completionRate = this.calculateCompletionRate(
        totalCompleted,
        totalAttempted,
      );

      return {
        category,
        totalAttempted,
        totalCompleted,
        completionRate,
      };
    });
  }

  public async getStats(options: AnalyticsQueryOptions = {}): Promise<TaskAnalyticsStats> {
    const period = options.period || 'weekly';
    const { startDate, endDate } = this.resolveDateRange(options);

    const whereCondition: any = {};
    if (options.userId) {
      whereCondition.userId = options.userId;
    }

    const totalAttempted = await this.completionRepo.count({
      where: whereCondition,
    });

    const totalCompleted = await this.completionRepo.count({
      where: {
        ...whereCondition,
        status: TaskCompletionStatus.COMPLETED,
      },
    });

    const completionRate = this.calculateCompletionRate(totalCompleted, totalAttempted);
    const categoryBreakdown = await this.getCategoryBreakdown(
      startDate,
      endDate,
      options.userId,
    );

    return {
      period,
      totalAttempted,
      totalCompleted,
      completionRate,
      categoryBreakdown,
      dateRange: {
        startDate,
        endDate,
      },
    };
  }

  public async getWeeklyStats(userId?: string): Promise<TaskAnalyticsStats> {
    return this.getStats({ period: 'weekly', userId });
  }

  public async getDailyStats(userId?: string): Promise<TaskAnalyticsStats> {
    return this.getStats({ period: 'daily', userId });
  }
}
