import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsObject,
  IsIn,
  IsDateString,
} from 'class-validator';
import { TaskCategory } from '../../tasks/entities/health-task.entity';
import { TaskPriority } from '../../modules/health-tasks/services/priority.service';

export class UpdateHealthTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  xlmReward?: number;

  @IsOptional()
  @IsObject()
  targetProfile?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn([
    TaskPriority.URGENT,
    TaskPriority.HIGH,
    TaskPriority.MEDIUM,
    TaskPriority.LOW,
  ])
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
