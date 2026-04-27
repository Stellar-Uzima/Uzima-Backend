import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AdminService } from './services/admin.service';
import { TasksScheduler } from '@/tasks/tasks.scheduler';
import { RewardsScheduler } from '@/rewards/rewards.scheduler';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { Role } from '@/auth/enums/role.enum';

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
  ) {}

  @Get('dashboard/system')
  @ApiOperation({ summary: 'Get system overview statistics' })
  @ApiResponse({ status: 200, description: 'System statistics retrieved successfully' })
  async getSystemStatistics() {
    return this.adminService.getSystemStatistics();
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
}
