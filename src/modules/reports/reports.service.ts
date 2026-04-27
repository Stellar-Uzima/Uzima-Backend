import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/entities/user.entity';
import { TaskCompletion } from '@/tasks/entities/task-completion.entity';
import { RewardTransaction } from '@/rewards/entities/reward-transaction.entity';

export type ReportType = 'users' | 'activity' | 'health';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
    @InjectRepository(RewardTransaction)
    private readonly rewardTransactionRepository: Repository<RewardTransaction>,
  ) {}

  async getUserReport() {
    const totalUsers = await this.userRepository.count();
    const roleCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(user.id)', 'count')
      .groupBy('user.role')
      .getRawMany();

    const countryCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.country', 'country')
      .addSelect('COUNT(user.id)', 'count')
      .groupBy('user.country')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const activeUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.status = :active', { active: 'active' })
      .orWhere('user.isActive = true')
      .getCount();

    const usersLast30Days = await this.userRepository
      .createQueryBuilder('user')
      .where("user.createdAt >= NOW() - INTERVAL '30 days'")
      .getCount();

    return {
      totalUsers,
      activeUsers,
      usersLast30Days,
      roleBreakdown: roleCounts.map((row) => ({ role: row.role, count: Number(row.count) })),
      topCountries: countryCounts.map((row) => ({ country: row.country, count: Number(row.count) })),
    };
  }

  async getActivityReport() {
    const statusTotals = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('tc.status', 'status')
      .addSelect('COUNT(tc.id)', 'count')
      .groupBy('tc.status')
      .getRawMany();

    const completedLast7Days = await this.taskCompletionRepository.count({
      where: {
        completedAt: () => `completed_at >= NOW() - INTERVAL '7 days'`,
      } as any,
    });

    const rewardTotal = await this.rewardTransactionRepository
      .createQueryBuilder('rt')
      .select('COALESCE(SUM(rt.amount), 0)', 'totalAmount')
      .getRawOne();

    return {
      statusTotals: statusTotals.reduce((acc, row) => {
        acc[row.status] = Number(row.count);
        return acc;
      }, {} as Record<string, number>),
      completedLast7Days,
      totalRewardsDistributed: Number(rewardTotal.totalAmount || 0),
    };
  }

  async getHealthReport() {
    const activeUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.status = :active', { active: 'active' })
      .orWhere('user.isActive = true')
      .getCount();

    const completedTasksLast30Days = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .where("tc.completedAt >= NOW() - INTERVAL '30 days'")
      .getCount();

    const uniqueActiveUsers = await this.taskCompletionRepository
      .createQueryBuilder('tc')
      .select('COUNT(DISTINCT tc.userId)', 'count')
      .where("tc.completedAt >= NOW() - INTERVAL '30 days'")
      .getRawOne();

    return {
      activeUsers,
      completedTasksLast30Days,
      uniqueUsersCompletingTasks: Number(uniqueActiveUsers.count || 0),
      averageTasksPerActiveUser: activeUsers ? Number((completedTasksLast30Days / activeUsers).toFixed(2)) : 0,
    };
  }

  async getReportByType(type: ReportType) {
    switch (type) {
      case 'users':
        return this.getUserReport();
      case 'activity':
        return this.getActivityReport();
      case 'health':
        return this.getHealthReport();
      default:
        return {};
    }
  }
}
