import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  AuthEventOutcome,
  AuthEventType,
} from '../../../database/entities/auth-event.entity';

/** Query parameters accepted by the auth-event audit endpoints. */
export class QueryAuthEventsDto {
  @ApiPropertyOptional({ description: '1-based page number', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of events per page (1-200)',
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Restrict to a single user', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ enum: AuthEventType, description: 'Filter by event type' })
  @IsEnum(AuthEventType)
  @IsOptional()
  eventType?: AuthEventType;

  @ApiPropertyOptional({ enum: AuthEventOutcome, description: 'Filter by outcome' })
  @IsEnum(AuthEventOutcome)
  @IsOptional()
  outcome?: AuthEventOutcome;

  @ApiPropertyOptional({
    description: 'ISO-8601 inclusive lower bound on createdAt',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601 inclusive upper bound on createdAt',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
