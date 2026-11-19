import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { TaskCompletion, TaskCompletionStatus } from '../../tasks/entities/task-completion.entity';
import { HealthTask, TaskCategory } from '../../tasks/entities/health-task.entity';
import { TaskStatus } from '../../tasks/enums/task-status.enum';

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface TaskAnalyticsQuery {
  /** Reporting window; defaults to the last 7 days. */
  period?: AnalyticsPeriod;
  startDate?: Date;
  endDate?: Date;
  /** Restrict the report to a single user. */
  userId?: string;
}

export interface CategoryBreakdownItem {
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
  categoryBreakdown: CategoryBreakdownItem[];
}

export interface TaskMetrics {
  /** Average number of days between a completion being recorded and being completed. */
  averageCompletionTime: number;
  tasksByStatus: Record<string, number>;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<Exclude<AnalyticsPeriod, 'custom'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

@Injectable()
export class TaskAnalyticsService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepository: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>
  ) {}

  calculateCompletionRate(completed: number, attempted: number): number {
    if (!attempted || attempted <= 0) {
      return 0;
    }
    return Math.round((completed / attempted) * 100 * 100) / 100;
  }

  resolveDateRange(query: TaskAnalyticsQuery): { startDate: Date; endDate: Date } {
    const endDate = query.endDate ?? new Date();

    if (query.startDate) {
      return { startDate: query.startDate, endDate };
    }

    const period = query.period ?? 'weekly';
    const days = period === 'custom' ? PERIOD_DAYS.weekly : PERIOD_DAYS[period];

    return { startDate: new Date(endDate.getTime() - days * DAY_IN_MS), endDate };
  }

  async getStats(query: TaskAnalyticsQuery = {}): Promise<TaskAnalyticsStats> {
    const period = query.period ?? 'weekly';
    const { startDate, endDate } = this.resolveDateRange({ ...query, period });

    const where: FindOptionsWhere<TaskCompletion> = {
      completedAt: Between(startDate, endDate),
    };
    if (query.userId) {
      where.userId = query.userId;
    }

    const totalAttempted = await this.completionRepository.count({ where });
    const totalCompleted = await this.completionRepository.count({
      where: { ...where, isCompleted: true },
    });

    return {
      period,
      startDate,
      endDate,
      totalAttempted,
      totalCompleted,
      completionRate: this.calculateCompletionRate(totalCompleted, totalAttempted),
      categoryBreakdown: await this.getCategoryBreakdown(startDate, endDate, query.userId),
    };
  }

  async getWeeklyStats(userId?: string): Promise<TaskAnalyticsStats> {
    return this.getStats({ period: 'weekly', userId });
  }

  async getDailyStats(userId?: string): Promise<TaskAnalyticsStats> {
    return this.getStats({ period: 'daily', userId });
  }

  async getCategoryBreakdown(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<CategoryBreakdownItem[]> {
    const queryBuilder = this.completionRepository
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.category', 'category')
      .addSelect('COUNT(completion.id)', 'totalAttempted')
      .addSelect(
        `SUM(CASE WHEN completion.status = :verifiedStatus THEN 1 ELSE 0 END)`,
        'totalCompleted'
      )
      .where('completion.completedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('task.category')
      .setParameter('verifiedStatus', TaskCompletionStatus.VERIFIED);

    if (userId) {
      queryBuilder.andWhere('completion.userId = :userId', { userId });
    }

    const rows = await queryBuilder.getRawMany<{
      category: TaskCategory | null;
      totalAttempted: string | number;
      totalCompleted: string | number;
    }>();

    return rows.map((row) => {
      const totalAttempted = Number(row.totalAttempted ?? 0);
      const totalCompleted = Number(row.totalCompleted ?? 0);
      return {
        category: row.category ?? 'uncategorized',
        totalAttempted,
        totalCompleted,
        completionRate: this.calculateCompletionRate(totalCompleted, totalAttempted),
      };
    });
  }

  async calculateTaskMetrics(userId: string): Promise<TaskMetrics> {
    const tasksByStatus: Record<string, number> = {};
    for (const status of Object.values(TaskStatus)) {
      tasksByStatus[status] = await this.taskRepository.count({
        where: { status, createdBy: userId },
      });
    }

    const raw = await this.completionRepository
      .createQueryBuilder('completion')
      .select(
        'AVG(EXTRACT(EPOCH FROM (completion.completedAt - completion.createdAt)) / :secondsPerDay)',
        'averageDays'
      )
      .where('completion.userId = :userId', { userId })
      .andWhere('completion.completedAt IS NOT NULL')
      .setParameter('secondsPerDay', 86400)
      .getRawOne<{ averageDays: string | number | null }>();

    const averageDays = raw?.averageDays != null ? Number(raw.averageDays) : null;

    return {
      averageCompletionTime:
        averageDays == null || Number.isNaN(averageDays) ? 0 : Math.round(averageDays * 100) / 100,
      tasksByStatus,
    };
  }
}
