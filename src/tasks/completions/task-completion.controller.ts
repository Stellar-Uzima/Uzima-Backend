import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaskCompletionService } from './task-completion.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { StorageService } from '../../storage/storage.service';
@ApiTags('Task Completions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks/completions')
export class TaskCompletionController {
  constructor(
    private readonly service: TaskCompletionService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Complete a task and earn rewards' })
  completeTask(@Req() req: any, @Body() dto: CompleteTaskDto) {
    // req.user.id comes from JwtStrategy's validate() return value
    return this.service.completeTask(req.user.id, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user\'s task completions' })
  getMyCompletions(@Req() req: any) {
    return this.service.getUserCompletions(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get current user\'s completion statistics' })
  getStats(@Req() req: any) {
    return this.service.getUserCompletionStats(req.user.id);
  }

  @Post(':id/proof-upload-url')
  @ApiOperation({ summary: 'Generate a presigned upload URL for task proof' })
  getProofUploadUrl(
    @Req() req: any,
    @Param('id') taskId: string,
    @Body('contentType') contentType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  ) {
    return this.storageService.generatePresignedUploadUrl(
      req.user.id,
      taskId,
      contentType,
    );
  }
}
