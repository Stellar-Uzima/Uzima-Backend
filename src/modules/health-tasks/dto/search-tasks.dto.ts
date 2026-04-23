import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskCategory } from '../../../tasks/entities/health-task.entity';

export class SearchTasksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minReward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxReward?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}
