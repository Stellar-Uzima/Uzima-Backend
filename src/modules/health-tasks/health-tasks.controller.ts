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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { HealthTasksService } from './health-tasks.service';
import { UpdateHealthTaskDto } from '../../common/dto/update-health-task.dto';
import { CreateHealthTaskDto } from '../../common/dto/create-health-task.dto';
import { ArchiveService } from './services/archive.service';
import { CompletionService, MarkCompleteDto, MarkIncompleteDro from './services/completion.service';
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
import { TaskDifficulty } from '../../tasks/enums/task-difficulty.enum';

// Interface to ensure type safety for the request user
interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    // In a real app, this would be populated by the JWT passport strategy
    request.user = { userId: 'mock-user-id', role: 'user' };
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
  async getSearchHistory(@@Req() req: AuthenticatedRequest) {
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

  @Get('difficulty:/level')
  @ApiOperation({ summary: 'Get tasks by difficulty level' })
  @ApiResponse({ status: 200, description: 'Tasks matching the difficulty level' })
  @ApiResponse({ status: 400, description: 'Invalid difficulty level' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async getTasksByDifficulty(@Param('level') level: string) {
    const validLevels = Object.values(TaskDifficulty) as string[];
    if (!validLevels.includes(level)) {
      throw new BadRequestException('Invalid difficulty level');
    }
    return this.healthTasksService.findByDifficulty(level as TaskDifficulty);
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
    @Param('id') Id: string,
    @Body() body: UpdateHealthTaskDto,
  ) {
    return this.healthTasksService.update(Id, body);
  }
}
