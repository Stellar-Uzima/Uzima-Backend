import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The pagination envelope returned by every list endpoint (#1293).
 *
 * Shape: `{ data: [...], meta: { ... } }` — never a bare array. A bare array
 * gives the client no way to know whether more pages exist, which is what
 * forces clients into the "fetch until you get fewer than `limit` rows"
 * guesswork that this replaces.
 */
export class PaginationMeta {
  @ApiProperty({ description: 'Current page, 1-indexed', example: 1 })
  page: number;

  @ApiProperty({ description: 'Page size requested by the caller', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total rows matching the filter', example: 137 })
  total: number;

  @ApiProperty({
    description: 'Total number of pages. 0 when `total` is 0 (never NaN).',
    example: 7,
  })
  totalPages: number;

  @ApiProperty({ description: 'True when a further page exists', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'True when a previous page exists', example: false })
  hasPreviousPage: boolean;

  @ApiPropertyOptional({ description: 'Next page number, absent on the last page', example: 2 })
  nextPage?: number;

  @ApiPropertyOptional({ description: 'Previous page number, absent on page 1', example: 1 })
  previousPage?: number;

  @ApiProperty({ description: 'Index of the first row on this page (0-based), null when empty', example: 20 })
  firstItemIndex: number | null;

  @ApiProperty({ description: 'Index of the last row on this page (0-based), null when empty', example: 39 })
  lastItemIndex: number | null;

  @ApiPropertyOptional({
    description: 'Opaque cursor for the next page. Present only for cursor-based endpoints.',
  })
  nextCursor?: string;
}

export class PaginatedResult<T> {
  @ApiProperty({ description: 'Rows for the current page', isArray: true })
  data: T[];

  @ApiProperty({ description: 'Pagination metadata', type: PaginationMeta })
  meta: PaginationMeta;

  private constructor(data: T[], meta: PaginationMeta) {
    this.data = data;
    this.meta = meta;
  }

  /**
   * Builds a page from an already-counted `[rows, total]` pair.
   *
   * `totalPages` is 0 for an empty result set rather than `NaN`, which is what
   * a naive `Math.ceil(total / limit)` yields and what leaks into a client as
   * `"totalPages": null` over JSON.
   */
  static of<T>(
    rows: T[],
    total: number,
    options: { page: number; limit: number; nextCursor?: string | null },
  ): PaginatedResult<T> {
    const { page, limit } = options;
    const safeLimit = limit > 0 ? limit : 1;
    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
    const isEmpty = rows.length === 0;

    const meta: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * safeLimit < total,
      hasPreviousPage: page > 1 && total > 0,
      nextPage: page * safeLimit < total ? page + 1 : undefined,
      previousPage: page > 1 && total > 0 ? page - 1 : undefined,
      firstItemIndex: isEmpty ? null : (page - 1) * safeLimit,
      lastItemIndex: isEmpty ? null : (page - 1) * safeLimit + rows.length - 1,
      nextCursor: options.nextCursor ?? undefined,
    };

    return new PaginatedResult<T>(rows, meta);
  }

  /**
   * Cursor-based equivalent of {@link of}. `hasNextPage` is inferred by
   * over-fetching one row, so no `COUNT` is needed — the whole point of
   * cursors on a large table.
   */
  static fromCursor<T>(
    rows: T[],
    options: { limit: number; nextCursor?: string | null; encodeCursor: (row: T) => string },
  ): PaginatedResult<T> {
    const { limit, encodeCursor } = options;
    // Caller over-fetches by one so we can tell "full page" from "last page".
    const hasNextPage = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return new PaginatedResult<T>(page, {
      page: 0,
      limit,
      total: hasNextPage ? -1 : page.length,
      totalPages: hasNextPage ? -1 : 1,
      hasNextPage,
      hasPreviousPage: Boolean(options.nextCursor),
      firstItemIndex: null,
      lastItemIndex: null,
      nextCursor: hasNextPage && last !== undefined ? encodeCursor(last) : undefined,
    });
  }

  /** Maps the rows while preserving `meta`. */
  map<U>(mapper: (row: T) => U): PaginatedResult<U> {
    return PaginatedResult.of(
      this.data.map(mapper),
      this.meta.total,
      { page: this.meta.page, limit: this.meta.limit, nextCursor: this.meta.nextCursor },
    );
  }
}
