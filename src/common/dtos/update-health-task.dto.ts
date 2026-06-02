import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsObject,
  IsIn,
  IsDateString,
  IsUUID,
  IsArray,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategory } from '../../tasks/entities/health-task.entity';
import { TaskPriority } from '../../modules/health-tasks/services/priority.service';

export class UpdateHealthTaskDto {
  @ApiPropertyOptional({ description: 'Updated task title', example: 'Drink 3L of water' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated task description',
    example: 'Increase hydration on training days.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Updated category', enum: TaskCategory })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({
    description: 'Workflow status of the task',
    example: 'active',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'XLM reward amount granted on completion',
    example: 1.5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  xlmReward?: number;

  @ApiPropertyOptional({
    description: 'Free-form JSON object describing the audience this task targets',
    example: { gender: 'female', minAge: 18, maxAge: 45 },
  })
  @IsOptional()
  @IsObject()
  targetProfile?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Whether the task is currently active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Updated priority level', enum: TaskPriority })
  @IsOptional()
  @IsIn([
    TaskPriority.URGENT,
    TaskPriority.HIGH,
    TaskPriority.MEDIUM,
    TaskPriority.LOW,
  ])
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'New due date (ISO 8601 string)',
    example: '2026-06-01T18:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
