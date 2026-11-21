import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { TaskCategory } from '../../../tasks/entities/health-task.entity';
import { TaskStatus } from '../../../tasks/enums/task-status.enum';

/** Columns a caller may sort search results by. */
export enum TaskSortField {
  CREATED_AT = 'createdAt',
  TITLE = 'title',
  XLM_REWARD = 'xlmReward',
  STATUS = 'status',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Ensures the date range is ordered when both bounds are supplied, so a
 * backwards range is a 400 instead of a silently empty result set.
 */
@ValidatorConstraint({ name: 'isDateRangeOrdered', async: false })
export class IsDateRangeOrdered implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments): boolean {
    const { startDate } = args.object as SearchTasksDto;
    if (!startDate || !endDate) {
      return true;
    }
    return new Date(startDate).getTime() <= new Date(endDate).getTime();
  }

  defaultMessage(): string {
    return 'endDate must be on or after startDate';
  }
}

/**
 * Query parameters accepted by `GET /tasks` and `GET /tasks/search` (#1502).
 *
 * Every property is optional. Provided filters are combined with AND, so
 * `?status=ACTIVE&category=fitness` returns active fitness tasks only.
 * `createdBy` is deliberately absent: results are always scoped to the
 * authenticated caller by the service, never by a client-supplied id.
 */
export class SearchTasksDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive match against the task title or description',
    example: 'water',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  query?: string;

  @ApiPropertyOptional({ enum: TaskStatus, description: 'Exact match on task status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskCategory, description: 'Exact match on task category' })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound (ISO 8601) on task createdAt',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound (ISO 8601) on task createdAt',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  @Validate(IsDateRangeOrdered)
  endDate?: string;

  @ApiPropertyOptional({ enum: TaskSortField, default: TaskSortField.CREATED_AT })
  @IsOptional()
  @IsEnum(TaskSortField)
  sortBy?: TaskSortField = TaskSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
