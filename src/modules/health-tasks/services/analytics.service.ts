import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { TaskCompletion, TaskCompletionStatus } from '../../../tasks/entities/task-completion.entity';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { DailyTaskAssignment } from '../../../tasks/entities/daily-task-assignment.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepository: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
    @InjectRepository(DailyTaskAssignment)
    private readonly assignmentRepository: Repository<DailyTaskAssignment>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getUserTaskStats(userId: string) {
    const cacheKey = `user_stats_${userId}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const totalCompletions = await this.completionRepository.count({
      where: { user: { id: userId }, status: TaskCompletionStatus.VERIFIED },
    });

    const pendingCompletions = await this.completionRepository.count({
      where: { user: { id: userId }, status: TaskCompletionStatus.PENDING },
    });

    // Simple completion rate: verified / (verified + pending)
    const completionRate = totalCompletions > 0 
      ? (totalCompletions / (totalCompletions + pendingCompletions)) * 100 
      : 0;

    const stats = {
      totalCompletions,
      pendingCompletions,
      completionRate: Math.round(completionRate * 100) / 100,
    };

    await this.cacheManager.set(cacheKey, stats, 300000); // Cache for 5 minutes
    return stats;
  }

  async getGlobalStats() {
    const cacheKey = 'global_task_stats';
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const totalTasks = await this.taskRepository.count();
    const verifiedCompletions = await this.completionRepository.count({
      where: { status: TaskCompletionStatus.VERIFIED },
    });

    const categoryBreakdown = await this.completionRepository
      .createQueryBuilder('completion')
      .leftJoin('completion.task', 'task')
      .select('task.category', 'category')
      .addSelect('COUNT(completion.id)', 'count')
      .where('completion.status = :status', { status: TaskCompletionStatus.VERIFIED })
      .groupBy('task.category')
      .getRawMany();

    const stats = {
      totalTasks,
      totalVerifiedCompletions: verifiedCompletions,
      categoryBreakdown,
    };

    await this.cacheManager.set(cacheKey, stats, 600000); // Cache for 10 minutes
    return stats;
  }

  async getTrends(days: number = 7) {
    const cacheKey = `task_trends_${days}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await this.completionRepository
      .createQueryBuilder('completion')
      .select("DATE_TRUNC('day', completion.completedAt)", 'date')
      .addSelect('COUNT(completion.id)', 'count')
      .where('completion.completedAt >= :startDate', { startDate })
      .andWhere('completion.status = :status', { status: TaskCompletionStatus.VERIFIED })
      .groupBy("DATE_TRUNC('day', completion.completedAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    await this.cacheManager.set(cacheKey, trends, 3600000); // Cache for 1 hour
    return trends;
  }
}
