import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { Role } from '@/auth/enums/role.enum';
import { QueueService } from '@/shared/queue/queue.service';
import { BulkTaskAssignmentService } from '@/tasks/assignment/bulk-task-assignment.service';
import {
  BulkAssignTasksDto,
  BulkAssignTasksResponseDto,
} from '@/tasks/assignment/dto/bulk-assign-tasks.dto';

@ApiTags('Admin - Tasks')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTasksController {
  constructor(
    private readonly bulkTaskAssignmentService: BulkTaskAssignmentService,
    private readonly queueService: QueueService,
  ) {}

  @Post('bulk-assign')
  @ApiOperation({ summary: 'Bulk assign health tasks to multiple users' })
  @ApiResponse({
    status: 201,
    description: 'Bulk assignment queued successfully',
    type: BulkAssignTasksResponseDto,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async bulkAssign(
    @Body() dto: BulkAssignTasksDto,
  ): Promise<BulkAssignTasksResponseDto> {
    this.bulkTaskAssignmentService.validateBulkAssignPayload(
      dto.userIds,
      dto.taskIds,
    );

    const assignedDate = new Date().toISOString().split('T')[0];
    const job = await this.queueService.enqueueBulkTaskAssignment({
      userIds: dto.userIds,
      taskIds: dto.taskIds,
      assignedDate,
    });

    return {
      jobId: String(job.id),
      queuedUsers: dto.userIds.length,
      taskCount: dto.taskIds.length,
    };
  }
}
