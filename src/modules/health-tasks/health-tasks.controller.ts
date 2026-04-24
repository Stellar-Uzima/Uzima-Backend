import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  Query,
  Delete,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { HealthTasksService } from './health-tasks.service';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';
import { CreateHealthTaskDto } from '../../common/dtos/create-health-task.dto';
import { ArchiveService } from './services/archive.service';
import { CompletionService, MarkCompleteDto, MarkIncompleteDto } from './services/completion.service';
import { AnalyticsService } from './services/analytics.service';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { ActivityLogService } from './services/activity-log.service';
import { SearchTasksDto } from './dto/search-tasks.dto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

// Interface to ensure type safety for the request user
interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    // In a real app, this would be populated by the JWT Passport strategy
    request.user = { userId: 'mock-user-id', role: 'USER' };
    return true;
  }
}

@ApiTags('tasks')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class HealthTasksController {
  constructor(
    private readonly healthTasksService: HealthTasksService,
    private readonly archiveService: ArchiveService,
    private readonly completionService: CompletionService,
    private readonly analyticsService: AnalyticsService,
    private readonly searchService: TaskSearchService,
    private readonly attachmentsService: AttachmentsService,
    private readonly duplicationService: DuplicationService,
    private readonly activityLogService: ActivityLogService,
    private readonly duplicationService: DuplicationService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get user health tasks with filters and pagination' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.healthTasksService.getUserTasks(req.user.userId, {
      status,
      category,
      priority,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page || 1,
      limit: limit || 10,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
    });
  }

  @Get('search/history')
  @ApiOperation({ summary: 'Get search history for the current user' })
  async getSearchHistory(@Req() req: AuthenticatedRequest) {
    return this.searchService.getSearchHistory(req.user.userId);
  }

  @Get('archived')
  @ApiOperation({ summary: 'Get archived completed tasks' })
  async getArchivedTasks(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    return this.archiveService.getArchivedTasks(page, limit);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a completed task' })
  async archiveTask(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.archiveService.archiveTask(id, req.user.userId);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore task from archive' })
  async restoreTask(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.archiveService.restoreTask(id, req.user.userId);
  }

  @Get('archive/config')
  @ApiOperation({ summary: 'Get auto-archive configuration' })
  getAutoArchiveConfig() {
    return this.archiveService.getAutoArchiveConfig();
  }

  @Put('archive/config')
  @ApiOperation({ summary: 'Update auto-archive configuration' })
  updateAutoArchiveConfig(@Body() body: { enabled?: boolean; olderThanDays?: number }) {
    return this.archiveService.updateAutoArchiveConfig(body);
  }

  @Post('archive/run')
  @ApiOperation({ summary: 'Run auto-archive for old completed tasks' })
  async runAutoArchive() {
    const archivedCount = await this.archiveService.autoArchiveOldCompletedTasks();
    return { archivedCount };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all task categories' })
  async getCategories() {
    return { message: 'Get categories logic to be implemented' };
  }

  @Post()
  @ApiOperation({ summary: 'Create new health task (admin only)' })
  async create(@Body() body: any) {
    return { message: 'Create task logic to be implemented' };
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get task activity history' })
  async getActivityHistory(@Param('id') id: string) {
    return this.activityLogService.getActivityHistory(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details' })
  async findOne(@Param('id') id: string) {
    return this.healthTasksService.findOne(id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark task as completed by user' })
  async completeTask(
    @Param('id') id: string,
    @Body() dto: MarkCompleteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    dto.taskId = id;
    return this.completionService.markTaskComplete(req.user.userId, dto);
  }

  @Post(':id/incomplete')
  @ApiOperation({ summary: 'Mark task as incomplete by user' })
  async markTaskIncomplete(
    @Param('id') id: string,
    @Body() dto: MarkIncompleteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    dto.taskId = id;
    return this.completionService.markTaskIncomplete(req.user.userId, dto);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get completion history for a task' })
  async getCompletionHistory(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.completionService.getCompletionHistory(req.user.userId, id);
  }

  @Get('user/:userId/metrics')
  @ApiOperation({ summary: 'Get completion metrics for a user' })
  async getCompletionMetrics(@Param('userId') userId: string) {
    return this.completionService.getCompletionMetrics(userId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get completion statistics for a task' })
  async getTaskCompletionStats(@Param('id') id: string) {
    return this.completionService.getTaskCompletionStats(id);
  async completeTask(@Param('id') id: string, @Body() body: any) {
    return { message: 'Complete task logic to be implemented' };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get tasks assigned to user' })
  async getUserTasks(@Param('userId') userId: string) {
    return { message: 'Get user tasks logic to be implemented' };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update task (admin only)' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateHealthTaskDto,
    @Req() req: AuthenticatedRequest
  ) {
    const task = await this.healthTasksService.findOne(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = task.createdBy && task.createdBy === req.user.userId;
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Forbidden');
    }

    const updated = await this.healthTasksService.update(
      id,
      body,
      req.user.userId,
    );
    return updated;
    return this.healthTasksService.update(id, body);
  }

  /**
   * UPDATED FOR ISSUE #505
   * Endpoint: DELETE /api/tasks/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a health task' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    // We pass the userId from the authenticated request to the service
    // for the mandatory permission check.
    await this.healthTasksService.remove(id, req.user.userId);

    return {
      success: true,
      message: 'Task and related reminders deleted successfully',
    };
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a task' })
  async duplicate(@Param('id') id: string, @Body() body: any) {
    return this.duplicationService.duplicateTask(id, body);
  }

  @Post('bulk-duplicate')
  @ApiOperation({ summary: 'Bulk duplicate tasks' })
  async bulkDuplicate(@Body() body: { ids: string[]; commonOverrides?: any }) {
    return this.duplicationService.bulkDuplicate(body.ids, body.commonOverrides);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload an attachment to a task' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Req() req: AuthenticatedRequest
  ) {
    if (!file) throw new NotFoundException('File not provided');

    return this.attachmentsService.createAttachment(id, {
      fileName: file.originalname,
      fileUrl: `/uploads/${file.filename}`,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedBy: req.user.userId,
    });
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'List attachments for a task' })
  async getAttachments(@Param('id') id: string) {
    return this.attachmentsService.getAttachmentsByTask(id);
  }

  @Delete('attachments/:id')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(@Param('id') id: string) {
    await this.attachmentsService.deleteAttachment(id);
    return { success: true };
  }

  @Get('analytics/dashboard')
  @ApiOperation({ summary: 'Get analytics dashboard with completion rates, trends, and statistics' })
  async getAnalyticsDashboard() {
    return this.analyticsService.getDashboard();
  }

  @Get('analytics/completion-rate')
  @ApiOperation({ summary: 'Get completion rate statistics' })
  async getCompletionRate() {
    const dashboard = await this.analyticsService.getDashboard();
    return dashboard.completionRate;
  }

  @Get('analytics/trends/:period')
  @ApiOperation({ summary: 'Get completion trends over time (daily/weekly/monthly)' })
  async getTrends(@Param('period') period: 'daily' | 'weekly' | 'monthly') {
    const dashboard = await this.analyticsService.getDashboard();
    return dashboard.trends[period];
  }

  @Get('analytics/categories')
  @ApiOperation({ summary: 'Get category breakdown statistics' })
  async getCategoryBreakdown() {
    const dashboard = await this.analyticsService.getDashboard();
    return dashboard.categoryBreakdown;
  }

  @Get('analytics/statistics')
  @ApiOperation({ summary: 'Get task statistics' })
  async getTaskStatistics() {
    const dashboard = await this.analyticsService.getDashboard();
    return dashboard.taskStatistics;
  }

  @Post('analytics/refresh')
  @ApiOperation({ summary: 'Refresh analytics cache' })
  async refreshAnalytics() {
    this.analyticsService.clearCache();
    return { message: 'Analytics cache cleared' };
  }
}
