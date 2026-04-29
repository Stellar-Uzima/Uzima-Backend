import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TaskCompletionService } from './task-completion.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StorageService } from '../../storage/storage.service';
@UseGuards(JwtAuthGuard)
@Controller('tasks/completions')
export class TaskCompletionController {
  constructor(
    private readonly service: TaskCompletionService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  completeTask(@Req() req: any, @Body() dto: CompleteTaskDto) {
    // req.user.id comes from JwtStrategy's validate() return value
    return this.service.completeTask(req.user.id, dto);
  }

  @Get('my')
  getMyCompletions(@Req() req: any) {
    return this.service.getUserCompletions(req.user.id);
  }

  @Post(':id/proof-upload-url')
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
