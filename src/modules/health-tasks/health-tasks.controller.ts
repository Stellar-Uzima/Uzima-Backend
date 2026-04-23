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
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthTasksService } from './health-tasks.service';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';
import { ArchiveService } from './services/archive.service';
import { CompletionService, MarkCompleteDto, MarkIncompleteDto } from './services/completion.service';
import { AnalyticsService } from './services/analytics.service';

// Minimal auth types/guard
interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = { userId: 'mock-user-id' }; // Mock in absence of real auth
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
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all available health tasks' })
  async findAll() {
    // TODO: Implement get all tasks with filters (category, difficulty, reward)
    return { message: 'Get all tasks logic to be implemented' };
  }

  @Get('archived')
  @ApiOperation({ summary: 'Get archived completed tasks' })
  async getArchivedTasks() {
    return this.archiveService.getArchivedTasks();
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
  updateAutoArchiveConfig(
    @Body() body: { enabled?: boolean; olderThanDays?: number },
  ) {
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
    // TODO: Return task categories (hydration, exercise, nutrition, maternal health, etc.)
    return { message: 'Get categories logic to be implemented' };
  }

  @Post()
  @ApiOperation({ summary: 'Create new health task (admin only)' })
  async create(@Body() body: any) {
    // TODO: Implement create task
    return { message: 'Create task logic to be implemented' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details' })
  async findOne(@Param('id') id: string) {
    // TODO: Implement get task by ID
    return { message: 'Get task logic to be implemented' };
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
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get tasks assigned to user' })
  async getUserTasks(@Param('userId') userId: string) {
    // TODO: Get tasks for specific user with completion status
    return { message: 'Get user tasks logic to be implemented' };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update task (admin only)' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateHealthTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // Find the task
    const task = await this.healthTasksService.findOne(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Permission: admin or creator
    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = task.createdBy && task.createdBy === req.user.userId;
    if (!isAdmin && !isCreator) {
      throw new ForbiddenException('Forbidden');
    }

    const updated = await this.healthTasksService.update(id, body);
    return updated;
  }
}
