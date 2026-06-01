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
import { TaskPriority } from '../../modules/health-tasks/services/priority.service';

export class UpdateHealthTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  tagIds?: string[];

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
