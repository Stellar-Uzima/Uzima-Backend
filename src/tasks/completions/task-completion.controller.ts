import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TaskCompletionService } from './task-completion.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tasks/completions')
export class TaskCompletionController {
  constructor(private readonly service: TaskCompletionService) {}

  @Post()
  completeTask(@Req() req: any, @Body() dto: CompleteTaskDto) {
    // req.user.id comes from JwtStrategy's validate() return value
    return this.service.completeTask(req.user.id, dto);
  }

  @Get('my')
  getMyCompletions(@Req() req: any) {
    return this.service.getUserCompletions(req.user.id);
  }
}
