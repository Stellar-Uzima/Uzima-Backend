import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeaderboardEntryDto {
  @ApiProperty({ description: 'Position on the leaderboard (1-indexed)', example: 1 })
  rank: number;

  @ApiProperty({ description: 'User identifier', example: 'uuid-v4-value' })
  userId: string;

  @ApiProperty({
    description: 'Anonymised display name (first name + last initial)',
    example: 'John D.',
  })
  displayName: string;

  @ApiProperty({ description: 'Total XLM earned', example: 1234.56 })
  totalXlm: number;

  @ApiProperty({ description: 'Country code or "Global"', example: 'NG' })
  country: string;
}

/** Pagination metadata included on every paginated leaderboard response. */
export class LeaderboardPaginationMeta {
  @ApiProperty({ description: 'Current page (1-indexed)', example: 1 })
  page: number;

  @ApiProperty({ description: 'Requested page size', example: 10 })
  limit: number;

  @ApiProperty({ description: 'True when a further page exists', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'True when a previous page exists', example: false })
  hasPreviousPage: boolean;

  @ApiPropertyOptional({ description: 'Next page number; absent on the last page', example: 2 })
  nextPage?: number;

  @ApiPropertyOptional({ description: 'Previous page number; absent on page 1', example: 1 })
  previousPage?: number;
}

export class LeaderboardResponseDto {
  @ApiProperty({
    description: 'Ranked entries for the requested page',
    type: [LeaderboardEntryDto],
  })
  topRankings: LeaderboardEntryDto[];

  @ApiProperty({
    description: "The authenticated user's own rank and score on this leaderboard",
  })
  myRank: {
    /** 1-indexed rank, or null when the user is not on the leaderboard. */
    rank: number | null;
    totalXlm: number;
  };

  @ApiProperty({
    description: 'Pagination metadata for the current page',
    type: LeaderboardPaginationMeta,
  })
  pagination: LeaderboardPaginationMeta;
}

/**
 * Response for the GET /leaderboard/me/rank endpoint.
 *
 * Contains only the fields that are safe to expose — no password hashes,
 * refresh tokens, 2FA secrets, or other restricted profile data.
 */
export class UserRankResponseDto {
  @ApiProperty({ description: 'User identifier', example: 'uuid-v4-value' })
  userId: string;

  @ApiProperty({
    description: 'Anonymised display name (first name + last initial)',
    example: 'John D.',
  })
  displayName: string;

  @ApiProperty({
    description: '1-indexed rank on this leaderboard; null when the user has no score',
    example: 42,
    nullable: true,
  })
  rank: number | null;

  @ApiProperty({ description: 'Total XLM earned in this leaderboard period', example: 350.75 })
  totalXlm: number;

  @ApiProperty({ description: 'Country code or "Global"', example: 'NG' })
  country: string;

  @ApiProperty({
    description: 'Leaderboard period this rank belongs to',
    enum: ['daily', 'weekly', 'monthly', 'all-time'],
    example: 'all-time',
  })
  period: string;
}
