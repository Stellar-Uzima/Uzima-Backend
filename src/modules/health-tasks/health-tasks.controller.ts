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
import { ArchiveService } from './services/archive.service';
import { TaskSearchService } from './services/task-search.service';
import { AttachmentsService } from './services/attachments.service';
import { DuplicationService } from './services/duplication.service';
import { ActivityLogService } from './services/activity-log.service';
import { SearchTasksDto } from './dto/search-tasks.dto';

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
    private readonly searchService: TaskSearchService,
    private readonly attachmentsService: AttachmentsService,
    private readonly duplicationService: DuplicationService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get and search health tasks with filters and pagination' })
  async findAll(@Query() query: SearchTasksDto, @Req() req: AuthenticatedRequest) {
    return this.searchService.searchTasks(query, req.user.userId);
  }

  @Get('search/history')
  @ApiOperation({ summary: 'Get search history for the current user' })
  async getSearchHistory(@Req() req: AuthenticatedRequest) {
    return this.searchService.getSearchHistory(req.user.userId);
  }

  @Get('archived')
  @ApiOperation({ summary: 'Get archived completed tasks' })
  async getArchivedTasks(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
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

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get task activity history' })
  async getActivityHistory(@Param('id') id: string) {
    return this.activityLogService.getActivityHistory(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details' })
  async findOne(@Param('id') id: string) {
    // TODO: Implement get task by ID
    return { message: 'Get task logic to be implemented' };
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark task as completed by user' })
  async completeTask(@Param('id') id: string, @Body() body: any) {
    // TODO: Implement task completion
    // - Verify task is valid
    // - Award XLM to user
    // - Update user stats
    return { message: 'Complete task logic to be implemented' };
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

    const updated = await this.healthTasksService.update(
      id,
      body,
      req.user.userId,
    );
    return updated;
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
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw new NotFoundException('File not provided');
    
    return this.attachmentsService.createAttachment(id, {
      fileName: file.originalname,
      fileUrl: `/uploads/${file.filename}`, // Mock URL
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
}
