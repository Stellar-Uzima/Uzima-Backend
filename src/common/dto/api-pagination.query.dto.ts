import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiErrorCode } from '../errors/api-error-codes.enum';
import { BadRequestApiException } from '../errors/api-error.exception';
import { SortOrder } from './pagination.dto';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * A sortable column that may appear in an `ORDER BY`.
 *
 * This is an allowlist, never a raw passthrough. Interpolating a caller-supplied
 * `sortBy` into SQL is the classic ordering-injection hole: a value like
 * `(SELECT password FROM users LIMIT 1)` is syntactically valid to the driver.
 * Because `sortBy` is checked against this set before it ever reaches a
 * `QueryBuilder`, that payload is rejected with a 400.
 */
export const SORTABLE_COLUMNS = [
  'id',
  'email',
  'firstName',
  'lastName',
  'fullName',
  'role',
  'status',
  'isVerified',
  'isActive',
  'createdAt',
  'updatedAt',
  'lastActiveAt',
] as const;

export type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

/** Throws a 400 naming the permitted values, rather than silently falling back. */
export function assertSortableColumn(field: string): SortableColumn {
  if (!(SORTABLE_COLUMNS as readonly string[]).includes(field)) {
    throw new BadRequestApiException(
      `sortBy must be one of: ${SORTABLE_COLUMNS.join(', ')}`,
      { sortBy: [`Received '${field}'`] },
    );
  }
  return field as SortableColumn;
}

/**
 * Query parameters shared by every paginated endpoint (#1293).
 *
 * Extends the existing `PaginationDto` so current call sites keep working,
 * while adding a `sortBy`/`sortOrder` shorthand (the existing `sort` array
 * requires a shape that query strings cannot express) and an opaque `cursor`.
 */
export class ApiPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, 1-indexed',
    minimum: 1,
    default: DEFAULT_PAGE,
  })
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? DEFAULT_PAGE : Number(value)))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Rows per page',
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
  })
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? DEFAULT_LIMIT : Number(value)))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT, {
    message: `limit must be between 1 and ${MAX_LIMIT}`,
  })
  @IsOptional()
  limit: number = DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: 'Column to sort by. Unknown values are rejected with 400 rather than ignored.',
    enum: SORTABLE_COLUMNS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy: SortableColumn | string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description:
      'Opaque cursor from a previous response. When present, `page` is ignored and offset pagination is skipped.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Include the total row count. Disabled for large exports to skip the COUNT query.',
    default: true,
  })
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? true : value === true || value === 'true'))
  @IsBoolean()
  @IsOptional()
  includeTotal: boolean = true;

  /** Normalised `skip` for TypeORM. */
  get skip(): number {
    return (Math.max(1, this.page) - 1) * this.limit;
  }

  /** `take`, with one extra row when a total count is not wanted. */
  get take(): number {
    return this.limit + 1;
  }

  /** `true` when this is a cursor request, which suppresses `page`/`skip`. */
  get usesCursor(): boolean {
    return typeof this.cursor === 'string' && this.cursor.length > 0;
  }
}

/**
 * Builds an `ORDER BY` that is total and therefore stable.
 *
 * `ORDER BY created_at DESC` alone is not deterministic: rows sharing a
 * `created_at` (same millisecond, or backfilled rows) can appear in any order
 * between two requests, so an item is duplicated on one page and skipped on the
 * next while the client is paging. Appending `id` as a tiebreaker makes the
 * order total, so each row has exactly one position and paging neither repeats
 * nor drops it.
 */
export function buildStableOrder(
  qb: { orderBy: (field: string, order?: SortOrder) => any; addOrderBy: (field: string, order?: SortOrder) => any },
  alias: string,
  sortBy: string,
  sortOrder: SortOrder,
  tiebreaker: string = 'id',
): void {
  const field = assertSortableColumn(sortBy);
  qb.orderBy(`${alias}.${field}`, sortOrder);

  if (field !== tiebreaker) {
    // Same direction as the primary key keeps the two halves consistent.
    qb.addOrderBy(`${alias}.${tiebreaker}`, sortOrder);
  }
}

export { ApiErrorCode, SortOrder };
