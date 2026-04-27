import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiQuery,
  ApiProperty,
} from '@nestjs/swagger';
import { IsArray, IsEnum, IsString } from 'class-validator';
import { Response } from 'express';
import { ReportsService, ReportType } from './reports.service';
import { ReportExportService } from './report-export.service';
import { ReportsSchedulerService } from './reports-scheduler.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { Role } from '@/auth/enums/role.enum';

class ScheduleReportDto {
  @ApiProperty({ example: 'weekly-user-report', description: 'Unique schedule name' })
  @IsString()
  name: string;

  @ApiProperty({ example: '0 0 * * 0', description: 'Cron expression in UTC' })
  @IsString()
  cronExpression: string;

  @ApiProperty({ example: 'users', enum: ['users', 'activity', 'health'] })
  @IsString()
  reportType: ReportType;

  @ApiProperty({ example: ['550e8400-e29b-41d4-a716-446655440000'], type: [String] })
  @IsArray()
  recipients: string[];
}

class DistributeReportDto {
  @ApiProperty({ example: 'activity', enum: ['users', 'activity', 'health'] })
  @IsString()
  reportType: ReportType;

  @ApiProperty({ example: ['550e8400-e29b-41d4-a716-446655440000'], type: [String] })
  @IsArray()
  recipients: string[];
}

@ApiTags('Reports')
@ApiBearerAuth()
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportExportService: ReportExportService,
    private readonly schedulerService: ReportsSchedulerService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'Get user reports and summary statistics' })
  @ApiResponse({ status: 200, description: 'User report returned' })
  async getUserReport() {
    return this.reportsService.getUserReport();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get activity reports for tasks and rewards' })
  @ApiResponse({ status: 200, description: 'Activity report returned' })
  async getActivityReport() {
    return this.reportsService.getActivityReport();
  }

  @Get('health')
  @ApiOperation({ summary: 'Get health statistics report' })
  @ApiResponse({ status: 200, description: 'Health report returned' })
  async getHealthReport() {
    return this.reportsService.getHealthReport();
  }

  @Get('export/rewards')
  @ApiOperation({ summary: 'Export rewards data as JSON or CSV' })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], required: false })
  async exportRewards(
    @Query('format') format: string = 'json',
    @Res() res: Response,
  ) {
    if (format === 'csv') {
      const csvStream = this.reportExportService.streamRewardsCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="rewards-report.csv"');
      csvStream.pipe(res);
      return;
    }
    return this.reportsService.getReportByType('activity');
  }

  @Post('schedule')
  @ApiOperation({ summary: 'Create a scheduled report' })
  @ApiResponse({ status: 201, description: 'Scheduled report created' })
  async scheduleReport(@Body() dto: ScheduleReportDto) {
    return this.schedulerService.scheduleReport(
      dto.name,
      dto.cronExpression,
      dto.reportType,
      dto.recipients,
    );
  }

  @Get('schedules')
  @ApiOperation({ summary: 'List configured scheduled reports' })
  @ApiResponse({ status: 200, description: 'Scheduled reports returned' })
  async getSchedules() {
    return this.schedulerService.listSchedules();
  }

  @Post('distribute')
  @ApiOperation({ summary: 'Distribute a report immediately' })
  @ApiResponse({ status: 200, description: 'Report distribution triggered' })
  async distributeReport(@Body() dto: DistributeReportDto) {
    return this.schedulerService.distributeReport(
      dto.reportType,
      dto.recipients,
      `Manual report distribution: ${dto.reportType}`,
    );
  }
}
