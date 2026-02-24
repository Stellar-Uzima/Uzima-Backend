import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TaskAssignmentService } from './assignment/task-assignment.service';

interface AuthenticatedRequest extends Request {
  user?: {
    sub?: string;
    userId?: string;
    id?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly taskAssignmentService: TaskAssignmentService,
  ) {}

  @Get('today')
  async getTodayTasks(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? req.user?.userId ?? req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User context not found in request');
    }

    return this.taskAssignmentService.getTodayTasksForUser(userId);
  }
}
