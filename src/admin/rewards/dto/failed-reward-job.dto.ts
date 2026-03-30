import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListFailedJobsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class FailedRewardJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  xlmAmount: number;

  @ApiPropertyOptional()
  taskCompletionId?: string;

  @ApiProperty()
  errorMessage: string;

  @ApiPropertyOptional()
  jobId?: string;

  @ApiProperty()
  attemptsMade: number;

  @ApiProperty()
  jobType: string;

  @ApiProperty()
  failedAt: Date;
}

export class ListFailedJobsResponseDto {
  @ApiProperty({ type: [FailedRewardJobResponseDto] })
  data: FailedRewardJobResponseDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class ReplayFailedJobResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  replayedJobId?: string;
}
