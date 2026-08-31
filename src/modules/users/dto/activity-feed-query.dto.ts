import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum ActivityType {
  TASK_COMPLETED = 'task_completed',
  BADGE_EARNED = 'badge_earned',
  XP_AWARDED = 'xp_awarded',
  STREAK_UPDATED = 'streak_updated',
}

export class ActivityFeedQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter activities by type',
    enum: ActivityType,
    example: ActivityType.TASK_COMPLETED,
  })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ApiPropertyOptional({
    description: 'Filter activities after this date (ISO 8601 format)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  since?: string;
}
