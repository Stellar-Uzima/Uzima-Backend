import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BulkAssignTasksDto {
  @ApiProperty({
    description: 'User IDs to assign tasks to (max 1000)',
    type: [String],
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  userIds: string[];

  @ApiProperty({
    description: 'Health task IDs to assign',
    type: [String],
    example: ['task-uuid-1'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  taskIds: string[];
}

export class BulkAssignTasksResponseDto {
  @ApiProperty({ description: 'Queue job ID for tracking progress' })
  jobId: string;

  @ApiProperty({ description: 'Number of users queued for assignment' })
  queuedUsers: number;

  @ApiProperty({ description: 'Number of tasks per user' })
  taskCount: number;
}
