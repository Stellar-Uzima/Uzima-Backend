import { IsDateString, IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RewardHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Start date for filtering rewards (ISO 8601 format)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for filtering rewards (ISO 8601 format)',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by health task category ID',
    type: String,
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class RewardHistoryItemDto {
  @ApiProperty({
    description: 'Unique identifier for the reward transaction',
    type: String,
  })
  id: string;

  @ApiProperty({
    description: 'Amount of XLM rewarded',
    type: Number,
  })
  amount: number;

  @ApiProperty({
    description: 'Status of the reward transaction',
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    type: String,
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Stellar transaction hash (only shown for COMPLETED status)',
    type: String,
  })
  stellarTxHash?: string;

  @ApiProperty({
    description: 'Title of the health task',
    type: String,
  })
  taskTitle: string;

  @ApiPropertyOptional({
    description: 'Category ID of the health task',
    type: String,
  })
  categoryId?: string;

  @ApiProperty({
    description: 'When the reward transaction was created',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;
}

export class RewardHistoryResponseDto {
  @ApiProperty({
    description: 'Array of reward transactions',
    type: [RewardHistoryItemDto],
  })
  data: RewardHistoryItemDto[];

  @ApiProperty({
    description: 'Current page number',
    type: Number,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of items',
    type: Number,
  })
  total: number;

  @ApiProperty({
    description: 'Total number of pages',
    type: Number,
  })
  totalPages: number;
}
