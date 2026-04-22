import { Controller, Get, Post, Put, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthTasksService } from './health-tasks.service';

@ApiTags('tasks')
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
  async update(@Param('id') id: string, @Body() body: any) {
    // TODO: Implement update task
    return { message: 'Update task logic to be implemented' };
  }
}
