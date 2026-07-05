import { IsOptional, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum RewardStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export class PayoutHistoryQueryDto {
  @IsOptional()
  @IsEnum(RewardStatus)
  status?: RewardStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;
}