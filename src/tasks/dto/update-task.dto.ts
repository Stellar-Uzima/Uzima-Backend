import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({
    description: 'Task status (only ADMIN can set to ACTIVE)',
    enum: TaskStatus,
    example: TaskStatus.ACTIVE,
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;
}
