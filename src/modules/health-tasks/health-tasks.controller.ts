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
  constructor(private readonly healthTasksService: HealthTasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all available health tasks' })
  async findAll() {
    // TODO: Implement get all tasks with filters (category, difficulty, reward)
    return { message: 'Get all tasks logic to be implemented' };
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

    const updated = await this.healthTasksService.update(id, body);
    return updated;
  }
}
