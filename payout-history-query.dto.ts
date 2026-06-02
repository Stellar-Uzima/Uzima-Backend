import { IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RewardStatus } from '../enums/reward-status.enum';

export class PayoutHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(RewardStatus)
  status?: RewardStatus;

  categoryId?: string;
}