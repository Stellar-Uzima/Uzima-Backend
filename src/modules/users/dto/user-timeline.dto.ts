import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum UserTimelineEventType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  PROFILE_UPDATE = 'profile_update',
  TASK_COMPLETED = 'task_completed',
  TASK_CREATED = 'task_created',
  REWARD_EARNED = 'reward_earned',
  REWARD_FAILED = 'reward_failed',
  REFERRAL_MADE = 'referral_made',
  REFERRAL_REDEEMED = 'referral_redeemed',
  WALLET_DEPOSIT = 'wallet_deposit',
  WALLET_WITHDRAW = 'wallet_withdraw',
  BADGE_EARNED = 'badge_earned',
  AVATAR_UPDATED = 'avatar_updated',
  EMAIL_VERIFIED = 'email_verified',
}

export class UserTimelineQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter timeline entries by event type(s)',
    type: [UserTimelineEventType],
    isArray: true,
    example: [UserTimelineEventType.REWARD_EARNED, UserTimelineEventType.TASK_COMPLETED],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map((v) => v.trim());
    return value;
  })
  @IsArray()
  @IsEnum(UserTimelineEventType, { each: true })
  eventTypes?: UserTimelineEventType[];

  @ApiPropertyOptional({
    description: 'Return events that occurred on or after this ISO date',
    example: '2026-01-01T00:00:00.000Z',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Return events that occurred on or before this ISO date',
    example: '2026-12-31T23:59:59.999Z',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UserTimelineEntryDto {
  @ApiProperty({ description: 'Unique timeline entry identifier' })
  id: string;

  @ApiProperty({
    description: 'Timeline event type',
    enum: UserTimelineEventType,
  })
  type: UserTimelineEventType;

  @ApiProperty({ description: 'Short summary title for the event' })
  title: string;

  @ApiPropertyOptional({
    description: 'Optional human-readable description of the event',
  })
  description?: string;

  @ApiProperty({ description: 'When the event occurred' })
  occurredAt: Date;

  @ApiPropertyOptional({
    description: 'Structured metadata specific to the event type',
    type: 'object',
    additionalProperties: true,
  })
  metadata?: Record<string, unknown>;
}

export class UserTimelineResponseDto {
  @ApiProperty({ description: 'Chronological timeline entries (newest first)', type: [UserTimelineEntryDto] })
  data: UserTimelineEntryDto[];

  @ApiProperty({ description: 'Total matching entries across all pages' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Entries per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages available' })
  totalPages: number;

  @ApiPropertyOptional({ description: 'True when more pages are available' })
  hasNext?: boolean;

  @ApiPropertyOptional({ description: 'True when a previous page exists' })
  hasPrev?: boolean;

  @ApiPropertyOptional({ description: 'Event types actually applied to the result set' })
  filteredEventTypes?: UserTimelineEventType[];
}
