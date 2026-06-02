import { Controller, Get, Post, UseGuards, Query, Res } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AdminService } from './services/admin.service';
import { TasksScheduler } from '@/tasks/tasks.scheduler';
import { RewardsScheduler } from '@/rewards/rewards.scheduler';
import { ReportsService } from '@modules/reports/reports.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { Role } from '@/auth/enums/role.enum';
import { CacheService } from '@/shared/cache/cache.service';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tasksScheduler: TasksScheduler,
    private readonly rewardsScheduler: RewardsScheduler,
    private readonly reportsService: ReportsService,
    private readonly cacheService: CacheService,
  ) {}

  @Get('dashboard/system')
  @ApiOperation({ summary: 'Get system overview statistics' })
  @ApiResponse({ status: 200, description: 'System statistics retrieved successfully' })
  async getSystemStatistics() {
    return this.adminService.getSystemStatistics();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get overall dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  async getStats() {
    return this.cacheService.remember('admin_dashboard_stats', async () => {
      return this.adminService.getDashboardStats();
    }, 300);
  }

  @Get('dashboard/tasks')
  @ApiOperation({ summary: 'Get task analytics for admin dashboard' })
  @ApiResponse({ status: 200, description: 'Task analytics retrieved successfully' })
  async getTaskAnalytics() {
    return this.adminService.getTaskAnalytics();
  }

  @Get('dashboard/health')
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  async getHealthStatus() {
    return this.adminService.getHealthStatus();
  }

  @Post('tasks/assign-daily')
  @ApiOperation({ summary: 'Trigger manual daily task assignment' })
  @ApiResponse({ status: 200, description: 'Daily task assignment triggered successfully' })
  async assignDailyTasks() {
    const result = await this.tasksScheduler.assignDailyTasksManually();
    return {
      message: 'Daily task assignment completed',
      processed: result.processed,
      errors: result.errors,
    };
  }

  @Post('rewards/reset-daily')
  @ApiOperation({ summary: 'Trigger manual daily reward reset' })
  @ApiResponse({ status: 200, description: 'Daily rewards reset completed successfully' })
  async resetDailyRewards() {
    const result = await this.rewardsScheduler.resetDailyRewardsManually();
    return {
      message: 'Daily rewards reset completed',
      ...result,
    };
  }

  @Get('reports/health-summary')
  @ApiOperation({ summary: 'Get health summary report' })
  @ApiQuery({ name: 'period', enum: ['daily', 'weekly', 'monthly'], required: false })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], required: false })
  @ApiResponse({ status: 200, description: 'Health summary report retrieved successfully' })
  async getHealthSummary(
    @Query('period') period: string = 'daily',
    @Query('format') format: string = 'json',
    @Res() res: Response,
  ) {
    const summary = await this.reportsService.getHealthSummary(period);
    if (format === 'csv') {
      const csv = this.reportsService.generateHealthSummaryCsv(summary);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="health-summary-${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send(csv);
      return;
    }
    res.json(summary);
  }
}
