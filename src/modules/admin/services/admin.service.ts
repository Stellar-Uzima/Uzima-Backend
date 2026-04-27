import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from '@/health/redis-health.indicator';
import { User } from '@/entities/user.entity';
import { UserStatus } from '@/auth/enums/user-status.enum';
import { TaskCompletion, TaskCompletionStatus } from '@/tasks/entities/task-completion.entity';
import { RewardTransaction } from '@/rewards/entities/reward-transaction.entity';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
    @InjectRepository(RewardTransaction)
    private readonly rewardTransactionRepository: Repository<RewardTransaction>,
    private readonly dbHealth: TypeOrmHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
  ) {}

  async getSystemStatistics() {
    const totalUsers = await this.userRepository.count();
    const roles = await this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(user.id)', 'count')
      .groupBy('user.role')
      .getRawMany();

    const statusGroups = await this.userRepository
      .createQueryBuilder('user')
      .select('user.status', 'status')
      .addSelect('COUNT(user.id)', 'count')
      .groupBy('user.status')
      .getRawMany();

    const newUsersLast7Days = Number(
      (await this.userRepository
        .createQueryBuilder('user')
        .where("user.createdAt >= NOW() - INTERVAL '7 days'")
        .getCount()) || 0,
    );

    const walletLinked = await this.userRepository
      .createQueryBuilder('user')
      .where('user.stellarWalletAddress IS NOT NULL')
      .getCount();

    const activeUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.status = :active', { active: UserStatus.ACTIVE })
      .orWhere('user.isActive = true')
      .getCount();

    return {
      totalUsers,
      activeUsers,
      newUsersLast7Days,
      walletLinked,
      roles: roles.reduce((map, row) => ({
        ...map,
        [row.role]: Number(row.count),
      }), {} as Record<string, number>),
      status: statusGroups.reduce((map, row) => ({
        ...map,
        [row.status]: Number(row.count),
      }), {} as Record<string, number>),
    };
  }

  async getTaskAnalytics() {
    const statusCounts = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('tc.status', 'status')
      .addSelect('COUNT(tc.id)', 'count')
      .groupBy('tc.status')
      .getRawMany();

    const taskCounts = statusCounts.reduce(
      (result, row) => ({
        ...result,
        [row.status]: Number(row.count),
      }),
      {
        pending: 0,
        verified: 0,
        rejected: 0,
      } as Record<string, number>,
    );

    const recentCount = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .where("tc.completedAt >= NOW() - INTERVAL '24 hours'")
      .getCount();

    const last7DaysCount = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .where("tc.completedAt >= NOW() - INTERVAL '7 days'")
      .getCount();

    const totalRewards = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('COALESCE(SUM(tc.xlmRewarded), 0)', 'total')
      .where('tc.status = :status', { status: TaskCompletionStatus.VERIFIED })
      .getRawOne();

    const topUsers = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('tc.userId', 'userId')
      .addSelect('COUNT(tc.id)', 'completedTasks')
      .where('tc.status = :status', { status: TaskCompletionStatus.VERIFIED })
      .groupBy('tc.userId')
      .orderBy('completedTasks', 'DESC')
      .limit(5)
      .getRawMany();

    return {
      totals: taskCounts,
      totalRewards: Number(totalRewards.total || 0),
      last24Hours: recentCount,
      averageDailyLast7Days: Math.round(last7DaysCount / 7),
      topUsers: topUsers.map((row) => ({
        userId: row.userId,
        completedTasks: Number(row.completedTasks),
      })),
    };
  }

  async getHealthStatus() {
    const details: Record<string, any> = {};
    let overallStatus = 'ok';

    try {
      details.database = (await this.dbHealth.pingCheck('database')).database;
    } catch (error) {
      overallStatus = 'error';
      details.database = error?.causes?.database || { status: 'down' };
    }

    try {
      details.redis = await this.redisHealth.isHealthy('redis');
    } catch (error) {
      overallStatus = 'error';
      details.redis = error?.causes?.redis || { status: 'down' };
    }

    details.uptimeSeconds = Math.round(process.uptime());
    details.memoryUsage = process.memoryUsage();

    return {
      status: overallStatus,
      details,
    };
  }
}
