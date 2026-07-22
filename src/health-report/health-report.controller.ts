import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HealthReportService } from './health-report.service';
import { HealthReport } from './entities/health-report.entity';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    sub?: string;
    userId?: string;
  } | null;
};

@ApiTags('health-report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('health-report')
export class HealthReportController {
  constructor(
    private readonly healthReportService: HealthReportService,
    @InjectRepository(HealthReport)
    private readonly reportRepo: Repository<HealthReport>
  ) {}

  @Get()
  @ApiOperation({ summary: "List the current user's weekly health reports" })
  async listMyReports(@Req() req: AuthenticatedRequest) {
    const userId = this.extractUserId(req);
    return this.reportRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  @Post('generate')
  @ApiOperation({ summary: 'Manually trigger report generation for the current week' })
  async generateMyReport(@Req() req: AuthenticatedRequest) {
    const userId = this.extractUserId(req);
    const { periodStart, periodEnd } = this.getCurrentWeekPeriod();

    const report = await this.healthReportService.findOrCreatePendingReport(
      userId,
      periodStart,
      periodEnd
    );

    return this.healthReportService.generateReport(report.id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get a time-limited download URL for a report' })
  async download(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = this.extractUserId(req);
    const downloadUrl = await this.healthReportService.getDownloadUrl(id, userId);
    return { downloadUrl };
  }

  private getCurrentWeekPeriod(): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;

    const periodStart = new Date(now);
    periodStart.setUTCDate(now.getUTCDate() - daysSinceMonday);
    periodStart.setUTCHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodStart.getUTCDate() + 6);
    periodEnd.setUTCHours(23, 59, 59, 999);

    return { periodStart, periodEnd };
  }

  private extractUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Authenticated user context is missing');
    }
    return userId;
  }
}
