import { IsOptional, IsString, IsEnum, IsBoolean, IsNumber, IsObject } from 'class-validator';
import { TaskCategory } from '../../tasks/entities/health-task.entity';

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
}
