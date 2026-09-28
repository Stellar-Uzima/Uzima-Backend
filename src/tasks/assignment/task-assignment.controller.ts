// src/tasks/assignment/task-assignment.controller.ts
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { TaskAssignmentService } from './task-assignment.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { User } from '../../entities/user.entity';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskAssignmentController {
  constructor(private readonly assignmentService: TaskAssignmentService) {}

  @Get('today')
  @ApiOperation({
    summary: "Get or generate today's personalized task assignment",
  })
  @ApiResponse({
    status: 200,
    description: "Today's task assignment retrieved successfully",
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTodayTasks(@Request() req: { user: User }) {
    return this.assignmentService.getTodayAssignment(req.user);
  }
}
