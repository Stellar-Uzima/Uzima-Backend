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
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { HealthTasksService } from './health-tasks.service';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';
import { CreateHealthTaskDto } from '../../common/dtos/create-health-task.dto';
import { ArchiveService } from './services/archive.service';
import { CompletionService, MarkCompleteDto, MarkIncompleteDto } from './services/completion.service';
import { AnalyticsService } from './services/analytics.service';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { SearchTasksDto } from './dto/search-tasks.dto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  TaskAnalyticsService,
  AnalyticsPeriod,
} from '../../shared/analytics/task-analytics.service';

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
    private readonly taskAnalyticsService: TaskAnalyticsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get user health tasks with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of the caller\'s health tasks' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
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
  @ApiResponse({ status: 200, description: 'Recent search history for the caller' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getSearchHistory(@Req() req: AuthenticatedRequest) {
    return this.searchService.getSearchHistory(req.user.userId);
  }

  @Get('archived')
  @ApiOperation({ summary: 'Get archived completed tasks' })
  @ApiResponse({ status: 200, description: 'Paginated list of archived completed tasks' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getArchivedTasks(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    return this.archiveService.getArchivedTasks(page, limit);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a completed task' })
  @ApiResponse({ status: 200, description: 'Task archived successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller does not own this task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async archiveTask(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.archiveService.archiveTask(id, req.user.userId);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore task from archive' })
  @ApiResponse({ status: 200, description: 'Task restored from archive' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller does not own this task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async restoreTask(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.archiveService.restoreTask(id, req.user.userId);
  }

  @Get('archive/config')
  @ApiOperation({ summary: 'Get auto-archive configuration' })
  @ApiResponse({ status: 200, description: 'Current auto-archive configuration' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  getAutoArchiveConfig() {
    return this.archiveService.getAutoArchiveConfig();
  }

  @Put('archive/config')
  @ApiOperation({ summary: 'Update auto-archive configuration' })
  @ApiResponse({ status: 200, description: 'Auto-archive configuration updated' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  updateAutoArchiveConfig(@Body() body: { enabled?: boolean; olderThanDays?: number }) {
    return this.archiveService.updateAutoArchiveConfig(body);
  }

  @Post('archive/run')
  @ApiOperation({ summary: 'Run auto-archive for old completed tasks' })
  @ApiResponse({ status: 200, description: 'Auto-archive sweep completed; returns the count of archived tasks' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async runAutoArchive() {
    const archivedCount = await this.archiveService.autoArchiveOldCompletedTasks();
    return { archivedCount };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all task categories' })
  @ApiResponse({ status: 200, description: 'List of available task categories' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getCategories() {
    return { message: 'Get categories logic to be implemented' };
  }

  @Post()
  @ApiOperation({ summary: 'Create new health task (admin only)' })
  @ApiResponse({ status: 201, description: 'Health task created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Only admins may create health tasks' })
  async create(@Body() body: CreateHealthTaskDto) {
    return this.healthTasksService.create(body);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get task activity history' })
  @ApiResponse({ status: 200, description: 'Chronological activity log for the task' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getActivityHistory(@Param('id') id: string) {
    return this.activityLogService.getActivityHistory(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details' })
  @ApiResponse({ status: 200, description: 'Task details' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async findOne(@Param('id') id: string) {
    return this.healthTasksService.findOne(id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark task as completed by user' })
  @ApiResponse({ status: 200, description: 'Task marked as complete' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
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
  @ApiResponse({ status: 200, description: 'Task marked as incomplete' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
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
  @ApiResponse({ status: 200, description: 'Completion history entries for the task' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getCompletionHistory(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.completionService.getCompletionHistory(req.user.userId, id);
  }

  @Get('user/:userId/metrics')
  @ApiOperation({ summary: 'Get completion metrics for a user' })
  @ApiResponse({ status: 200, description: 'Completion metrics for the specified user' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getCompletionMetrics(@Param('userId') userId: string) {
    return this.completionService.getCompletionMetrics(userId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get completion statistics for a task' })
  @ApiResponse({ status: 200, description: 'Completion statistics for the task' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getTaskCompletionStats(@Param('id') id: string) {
    return this.completionService.getTaskCompletionStats(id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get tasks assigned to user' })
  @ApiResponse({ status: 200, description: 'Tasks assigned to the specified user' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserTasks(@Param('userId') userId: string) {
    return { message: 'Get user tasks logic to be implemented' };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update task (admin only)' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller is neither the task creator nor an admin' })
  @ApiResponse({ status: 404, description: 'Task not found' })
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
  }

  /**
   * UPDATED FOR ISSUE #505
   * Endpoint: DELETE /api/tasks/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a health task' })
  @ApiResponse({ status: 200, description: 'Task and its related reminders were deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Caller is not allowed to delete this task' })
  @ApiResponse({ status: 404, description: 'Task not found' })
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
  @ApiResponse({ status: 201, description: 'Task duplicated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Source task not found' })
  async duplicate(@Param('id') id: string, @Body() body: any) {
    return this.duplicationService.duplicateTask(id, body);
  }

  @Post('bulk-duplicate')
  @ApiOperation({ summary: 'Bulk duplicate tasks' })
  @ApiResponse({ status: 201, description: 'Tasks duplicated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed on the request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
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
  @ApiResponse({ status: 201, description: 'Attachment uploaded successfully' })
  @ApiResponse({ status: 400, description: 'No file provided or file rejected' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
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
  @ApiResponse({ status: 200, description: 'List of attachments for the task' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getAttachments(@Param('id') id: string) {
    return this.attachmentsService.getAttachmentsByTask(id);
  }

  @Delete('attachments/:id')
  @ApiOperation({ summary: 'Delete an attachment' })
  @ApiResponse({ status: 200, description: 'Attachment deleted successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async deleteAttachment(@Param('id') id: string) {
    await this.attachmentsService.deleteAttachment(id);
    return { success: true };
  }

  @Get('analytics/user')
  @ApiOperation({ summary: 'Get task analytics for the current user' })
  @ApiResponse({ status: 200, description: 'Per-user task analytics for the caller' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getUserStats(@Req() req: AuthenticatedRequest) {
    return this.analyticsService.getUserTaskStats(req.user.userId);
  }

  @Get('analytics/global')
  @ApiOperation({ summary: 'Get global task analytics' })
  @ApiResponse({ status: 200, description: 'Aggregate analytics across all users' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getGlobalStats() {
    return this.analyticsService.getGlobalStats();
  }

  @Get('analytics/trends')
  @ApiOperation({ summary: 'Get task completion trends' })
  @ApiResponse({ status: 200, description: 'Daily task completion counts over the requested window' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getTrends(@Query('days') days: number = 7) {
    return this.analyticsService.getTrends(days);
  }

  /**
   * ISSUE FIX: Task completion analytics endpoint.
   *
   * GET /tasks/analytics?period=weekly[&startDate=...&endDate=...]
   *
   * Returns:
   *   - completion rate percentage
   *   - total completed
   *   - total attempted
   *   - per-category breakdown
   *   - date range used for the aggregation
   *
   * Supports period values: 'daily' | 'weekly' | 'monthly' | 'custom'
   * (defaults to 'weekly' when omitted).
   */
  @Get('analytics')
  @ApiOperation({
    summary:
      'Get task completion analytics (completion rate, totals, category breakdown) for a period',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getTaskAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query('period') period?: AnalyticsPeriod,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('scope') scope?: 'me' | 'global',
  ) {
    const userId = scope === 'global' && req.user.role === 'ADMIN' ? undefined : req.user.userId;
    return this.taskAnalyticsService.getStats({
      period: period ?? 'weekly',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
    });
  }
}
