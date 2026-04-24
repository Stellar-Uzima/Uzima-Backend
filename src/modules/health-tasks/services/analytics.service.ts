import {
  Injectable,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { TaskCompletion } from '../../../database/entities/task-completion.entity';
import { HealthTask, TaskCategory } from '../../../tasks/entities/health-task.entity';
import { User } from '../../../entities/user.entity';

export interface CompletionRate {
  overall: number;
  byCategory: Record<TaskCategory, number>;
  byUser: Record<string, number>;
}

export interface TaskStatistics {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  averageCompletionTime: number; // in days
  mostCompletedTask: {
    taskId: string;
    title: string;
    completionCount: number;
  } | null;
}

export interface TrendData {
  date: string;
  completions: number;
  completionRate: number;
}

export interface CategoryBreakdown {
  category: TaskCategory;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageReward: number;
}

export interface AnalyticsDashboard {
  completionRate: CompletionRate;
  taskStatistics: TaskStatistics;
  trends: {
    daily: TrendData[];
    weekly: TrendData[];
    monthly: TrendData[];
  };
  categoryBreakdown: CategoryBreakdown[];
  lastUpdated: Date;
}

@Injectable()
export class AnalyticsService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getDashboard(): Promise<AnalyticsDashboard> {
    const cacheKey = 'dashboard';
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    const [
      completionRate,
      taskStatistics,
      dailyTrends,
      weeklyTrends,
      monthlyTrends,
      categoryBreakdown,
    ] = await Promise.all([
      this.calculateCompletionRate(),
      this.calculateTaskStatistics(),
      this.calculateTrends('daily'),
      this.calculateTrends('weekly'),
      this.calculateTrends('monthly'),
      this.calculateCategoryBreakdown(),
    ]);

    const dashboard: AnalyticsDashboard = {
      completionRate,
      taskStatistics,
      trends: {
        daily: dailyTrends,
        weekly: weeklyTrends,
        monthly: monthlyTrends,
      },
      categoryBreakdown,
      lastUpdated: new Date(),
    };

    this.setCached(cacheKey, dashboard);
    return dashboard;
  }

  private async calculateCompletionRate(): Promise<CompletionRate> {
    const [totalTasks, completedTasks] = await Promise.all([
      this.taskRepo.count({ where: { isActive: true } }),
      this.completionRepo.count({ where: { isCompleted: true } }),
    ]);

    const overall = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // By category
    const categoryStats = await this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.category', 'category')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN completion.isCompleted THEN 1 ELSE 0 END)', 'completed')
      .where('task.isActive = :active', { active: true })
      .groupBy('task.category')
      .getRawMany();

    const byCategory: Record<TaskCategory, number> = {} as Record<TaskCategory, number>;
    Object.values(TaskCategory).forEach(category => {
      byCategory[category] = 0;
    });

    categoryStats.forEach(stat => {
      const total = parseInt(stat.total);
      const completed = parseInt(stat.completed);
      byCategory[stat.category as TaskCategory] = total > 0 ? (completed / total) * 100 : 0;
    });

    // By user
    const userStats = await this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.user', 'user')
      .select('user.id', 'userId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN completion.isCompleted THEN 1 ELSE 0 END)', 'completed')
      .groupBy('user.id')
      .getRawMany();

    const byUser: Record<string, number> = {};
    userStats.forEach(stat => {
      const total = parseInt(stat.total);
      const completed = parseInt(stat.completed);
      byUser[stat.userId] = total > 0 ? (completed / total) * 100 : 0;
    });

    return { overall, byCategory, byUser };
  }

  private async calculateTaskStatistics(): Promise<TaskStatistics> {
    const [totalTasks, activeTasks, completedTasks] = await Promise.all([
      this.taskRepo.count(),
      this.taskRepo.count({ where: { isActive: true } }),
      this.completionRepo.count({ where: { isCompleted: true } }),
    ]);

    // Average completion time (simplified - days between task creation and completion)
    const completionTimes = await this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('AVG(EXTRACT(EPOCH FROM (completion.completedAt - task.createdAt))/86400)', 'avgTime')
      .where('completion.isCompleted = :completed', { completed: true })
      .andWhere('completion.completedAt IS NOT NULL')
      .getRawOne();

    const averageCompletionTime = completionTimes?.avgTime ? parseFloat(completionTimes.avgTime) : 0;

    // Most completed task
    const mostCompleted = await this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.id', 'taskId')
      .addSelect('task.title', 'title')
      .addSelect('COUNT(*)', 'completionCount')
      .where('completion.isCompleted = :completed', { completed: true })
      .groupBy('task.id')
      .addGroupBy('task.title')
      .orderBy('completionCount', 'DESC')
      .limit(1)
      .getRawOne();

    const mostCompletedTask = mostCompleted ? {
      taskId: mostCompleted.taskId,
      title: mostCompleted.title,
      completionCount: parseInt(mostCompleted.completionCount),
    } : null;

    return {
      totalTasks,
      activeTasks,
      completedTasks,
      averageCompletionTime,
      mostCompletedTask,
    };
  }

  private async calculateTrends(period: 'daily' | 'weekly' | 'monthly'): Promise<TrendData[]> {
    let dateFormat: string;
    let interval: string;

    switch (period) {
      case 'daily':
        dateFormat = 'YYYY-MM-DD';
        interval = '1 day';
        break;
      case 'weekly':
        dateFormat = 'YYYY-WW';
        interval = '1 week';
        break;
      case 'monthly':
        dateFormat = 'YYYY-MM';
        interval = '1 month';
        break;
    }

    const trends = await this.completionRepo
      .createQueryBuilder('completion')
      .select(`DATE_TRUNC('${period}', completion.completedAt)`, 'date')
      .addSelect('COUNT(*)', 'completions')
      .addSelect('COUNT(CASE WHEN completion.isCompleted THEN 1 END)', 'completed')
      .where('completion.completedAt IS NOT NULL')
      .andWhere('completion.completedAt >= :startDate', {
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
      })
      .groupBy(`DATE_TRUNC('${period}', completion.completedAt)`)
      .orderBy(`DATE_TRUNC('${period}', completion.completedAt)`, 'ASC')
      .getRawMany();

    return trends.map(trend => ({
      date: trend.date.toISOString().split('T')[0],
      completions: parseInt(trend.completions),
      completionRate: parseInt(trend.completed) / parseInt(trend.completions) * 100,
    }));
  }

  private async calculateCategoryBreakdown(): Promise<CategoryBreakdown[]> {
    const categoryData = await this.completionRepo
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.category', 'category')
      .addSelect('COUNT(DISTINCT task.id)', 'totalTasks')
      .addSelect('COUNT(CASE WHEN completion.isCompleted THEN 1 END)', 'completedTasks')
      .addSelect('AVG(task.xlmReward)', 'averageReward')
      .where('task.isActive = :active', { active: true })
      .groupBy('task.category')
      .getRawMany();

    return categoryData.map(data => ({
      category: data.category as TaskCategory,
      totalTasks: parseInt(data.totalTasks),
      completedTasks: parseInt(data.completedTasks),
      completionRate: parseInt(data.totalTasks) > 0
        ? (parseInt(data.completedTasks) / parseInt(data.totalTasks)) * 100
        : 0,
      averageReward: parseFloat(data.averageReward) || 0,
    }));
  }

  private getCached(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCached(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // Method to clear cache (useful for testing or manual refresh)
  clearCache(): void {
    this.cache.clear();
  }
}