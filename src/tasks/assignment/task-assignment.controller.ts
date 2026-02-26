// src/tasks/assignment/task-assignment.controller.ts
import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { TaskAssignmentService } from './task-assignment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskAssignmentController {
  constructor(private readonly assignmentService: TaskAssignmentService) {}

  @Get('today')
  @ApiOperation({ summary: "Get or generate today's personalized task assignment" })
  async getTodayTasks(@Request() req) {
    return this.assignmentService.getTodayAssignment(req.user);
  }
}