import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { HealthTask } from './entities/health-task.entity';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HEALER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new health task (ADMIN or HEALER only)' })
  @ApiBody({
    type: CreateTaskDto,
    description: 'Payload for creating a new task',
    schema: {
      example: {
        title: 'Walk 10,000 steps',
        description: 'Keep your heart healthy by walking daily',
        categoryId: 2,
        xlmReward: 1.0,
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    return this.tasksService.create(createTaskDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active health tasks (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page for pagination', example: 20 })
  @ApiQuery({ name: 'categoryId', required: false, type: Number, description: 'Filter tasks by category ID', example: 2 })
  @ApiResponse({ status: 200, description: 'Returns paginated list of active tasks' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() listTasksDto: ListTasksDto,
  ): Promise<PaginatedResponseDto<HealthTask>> {
    return this.tasksService.findAll(listTasksDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific health task by ID (public)' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Returns the task' })
  @ApiResponse({ status: 400, description: 'Invalid ID format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.HEALER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a health task (owner or ADMIN)' })
  @ApiBody({
    type: UpdateTaskDto,
    description: 'Payload to update the task',
    schema: {
      example: {
        title: 'Updated walk challenge',
        description: 'Updated description of the task',
        categoryId: 1,
        xlmReward: 1.5,
        status: 'ACTIVE',
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Request() req,
  ) {
    return this.tasksService.update(
      id,
      updateTaskDto,
      req.user.userId,
      req.user.role,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete a health task (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid ID format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async remove(@Param('id') id: string) {
    await this.tasksService.remove(id);
    return { message: 'Task deleted successfully' };
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a soft-deleted health task (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Task restored successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async restore(@Param('id') id: string) {
    await this.tasksService.restore(id);
    return { message: 'Task restored successfully' };
  }
}
