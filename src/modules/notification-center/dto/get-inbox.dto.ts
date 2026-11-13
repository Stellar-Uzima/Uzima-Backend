import { IsBoolean, IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Maximum rows allowed per page.
 * A hard cap prevents a caller from dumping the entire notification history
 * in a single unbounded query.
 */
export const INBOX_MAX_PAGE_SIZE = 50;

export class GetInboxDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number (1-indexed)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: INBOX_MAX_PAGE_SIZE,
    description: `Rows per page. Capped at ${INBOX_MAX_PAGE_SIZE}.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INBOX_MAX_PAGE_SIZE, {
    message: `limit must not exceed ${INBOX_MAX_PAGE_SIZE}`,
  })
  limit?: number = 20;

  /**
   * When `true`, only unread notifications are returned.
   * When `false` or absent, all notifications (read + unread) are returned.
   */
  @ApiPropertyOptional({
    default: false,
    description: 'Return only unread notifications when true.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === true || value === 'true';
  })
  @IsBoolean()
  unreadOnly?: boolean;

  /**
   * ISO-8601 datetime (inclusive lower bound).
   * Only notifications created at or after this timestamp are returned.
   *
   * Example: `2024-01-01T00:00:00.000Z`
   */
  @ApiPropertyOptional({
    description: 'ISO-8601 start of date range (inclusive). Filters notifications created on or after this date.',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'since must be a valid ISO-8601 datetime string' })
  since?: string;

  /**
   * ISO-8601 datetime (inclusive upper bound).
   * Only notifications created at or before this timestamp are returned.
   *
   * Example: `2024-12-31T23:59:59.999Z`
   */
  @ApiPropertyOptional({
    description: 'ISO-8601 end of date range (inclusive). Filters notifications created on or before this date.',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'until must be a valid ISO-8601 datetime string' })
  until?: string;
}
