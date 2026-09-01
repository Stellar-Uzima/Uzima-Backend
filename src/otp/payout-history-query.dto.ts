import { IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RewardStatus } from '../enums/reward-status.enum';

export class PayoutHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Page number to retrieve', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // @IsOptional()
  // @Type(() => Number)
  // @IsInt()
  // @Min(1)
  // limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter payouts from this date (ISO 8601)', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter payouts up to this date (ISO 8601)', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by payout status', enum: RewardStatus, example: RewardStatus.SUCCESS })
  @IsOptional()
  @IsEnum(RewardStatus)
  status?: RewardStatus;

  @ApiPropertyOptional({ description: 'Filter by reward category id' })
  categoryId?: string;
}