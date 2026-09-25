import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '@/entities/user.entity';
import { UserDirectoryQueryDto } from '../dto/user-directory-query.dto';
import { ApiErrorCode } from '@/common/errors/api-error-codes.enum';
import { BadRequestApiException } from '@/common/errors/api-error.exception';
import { PaginatedResult } from '@/common/pagination/paginated-result';
import { CursorCodec, CursorPayload } from '@/common/pagination/cursor-codec';
import { SORTABLE_COLUMNS, SortOrder, assertSortableColumn, buildStableOrder } from '@/common/dto/api-pagination.query.dto';

/** Fields an admin directory row may expose. Password/2FA/token columns are excluded by omission. */
const DIRECTORY_COLUMNS = [
  'user.id',
  'user.email',
  'user.firstName',
  'user.lastName',
  'user.fullName',
  'user.phoneNumber',
  'user.avatar',
  'user.role',
  'user.status',
  'user.isActive',
  'user.isVerified',
  'user.country',
  'user.preferredLanguage',
  'user.twoFactorEnabled',
  'user.lastActiveAt',
  'user.lastLoginAt',
  'user.createdAt',
  'user.updatedAt',
] as const;

export interface UserDirectoryRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  avatar: string | null;
  role: string;
  status: string;
  isActive: boolean;
  isVerified: boolean;
  country: string | null;
  preferredLanguage: string | null;
  twoFactorEnabled: boolean;
  lastActiveAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Search and filtering over the user table (#1294).
 *
 * Everything is done in one SQL statement per page — no N+1 lookups, and the
 * `COUNT` is skipped when the caller does not need a total.
 */
@Injectable()
export class UserDirectoryService {
  private readonly cursors = new CursorCodec();

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async search(dto: UserDirectoryQueryDto): Promise<PaginatedResult<UserDirectoryRow>> {
    this.assertDateRanges(dto);

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .select([...DIRECTORY_COLUMNS])
      .where('user.deletedAt IS NULL');

    this.applyFilters(qb, dto);

    if (dto.usesCursor) {
      return this.runCursorQuery(qb, dto);
    }

    return this.runOffsetQuery(qb, dto);
  }

  // --- filter application -------------------------------------------------

  private applyFilters(qb: SelectQueryBuilder<User>, dto: UserDirectoryQueryDto): void {
    if (dto.q?.trim()) {
      // Escape LIKE metacharacters so a literal % does not become "match all",
      // and a literal _ does not become a single-character wildcard.
      const needle = `%${this.escapeLike(dto.q.trim().toLowerCase())}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(user.email) LIKE :needle ESCAPE \'\\\'', { needle })
            .orWhere('LOWER(user.firstName) LIKE :needle ESCAPE \'\\\'', { needle })
            .orWhere('LOWER(user.lastName) LIKE :needle ESCAPE \'\\\'', { needle })
            .orWhere('LOWER(user.fullName) LIKE :needle ESCAPE \'\\\'', { needle });
        }),
      );
    }

    if (dto.email?.trim()) {
      qb.andWhere('LOWER(user.email) = :email', { email: dto.email.trim().toLowerCase() });
    }

    if (dto.country?.trim()) {
      qb.andWhere('UPPER(user.country) = :country', { country: dto.country.trim().toUpperCase() });
    }

    if (dto.role) {
      qb.andWhere('user.role = :role', { role: dto.role });
    }

    if (dto.status) {
      qb.andWhere('user.status = :status', { status: dto.status });
    }

    if (dto.isVerified !== undefined) {
      qb.andWhere('user.isVerified = :isVerified', { isVerified: dto.isVerified });
    }

    if (dto.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: dto.isActive });
    }

    if (dto.createdFrom) {
      qb.andWhere('user.createdAt >= :createdFrom', { createdFrom: new Date(dto.createdFrom) });
    }

    if (dto.createdTo) {
      qb.andWhere('user.createdAt <= :createdTo', { createdTo: new Date(dto.createdTo) });
    }

    if (dto.lastActiveFrom) {
      qb.andWhere('user.lastActiveAt >= :lastActiveFrom', { lastActiveFrom: new Date(dto.lastActiveFrom) });
    }

    if (dto.lastActiveTo) {
      qb.andWhere('user.lastActiveAt <= :lastActiveTo', { lastActiveTo: new Date(dto.lastActiveTo) });
    }

    if (dto.hasPhone === true) {
      qb.andWhere("user.phoneNumber IS NOT NULL AND user.phoneNumber <> ''");
    } else if (dto.hasPhone === false) {
      qb.andWhere("(user.phoneNumber IS NULL OR user.phoneNumber = '')");
    }

    if (dto.hasAvatar === true) {
      qb.andWhere("user.avatar IS NOT NULL AND user.avatar <> ''");
    } else if (dto.hasAvatar === false) {
      qb.andWhere("(user.avatar IS NULL OR user.avatar = '')");
    }
  }

  // --- pagination strategies ---------------------------------------------

  private async runOffsetQuery(
    qb: SelectQueryBuilder<User>,
    dto: UserDirectoryQueryDto,
  ): Promise<PaginatedResult<UserDirectoryRow>> {
    buildStableOrder(qb, 'user', dto.sortBy, dto.sortOrder as SortOrder);
    qb.skip(dto.skip).take(dto.limit);

    if (dto.includeTotal) {
      const [rows, total] = await qb.getManyAndCount();
      return PaginatedResult.of(rows as UserDirectoryRow[], total, { page: dto.page, limit: dto.limit });
    }

    // Without a total we over-fetch by one to still report hasNextPage.
    const rows = await qb.take(dto.limit + 1).getMany();
    return PaginatedResult.fromCursor(rows as UserDirectoryRow[], {
      limit: dto.limit,
      encodeCursor: (row) => this.encodeCursor(row, dto.sortBy, dto.sortOrder as SortOrder),
    });
  }

  private async runCursorQuery(
    qb: SelectQueryBuilder<User>,
    dto: UserDirectoryQueryDto,
  ): Promise<PaginatedResult<UserDirectoryRow>> {
    const cursor = this.cursors.decode(dto.cursor!);
    const field = assertSortableColumn(cursor.f);
    const direction = cursor.d;

    // Reject a cursor issued for a different sort, otherwise the keyset
    // comparison below would compare unrelated columns.
    if (cursor.f !== dto.sortBy || cursor.d !== dto.sortOrder) {
      throw new BadRequestApiException(
        'cursor was issued for a different sort order; restart pagination without a cursor',
        {
          cursor: [`Cursor is for ${cursor.f} ${cursor.d}, request asked for ${dto.sortBy} ${dto.sortOrder}`],
        },
      );
    }

    const comparison = direction === 'ASC' ? '>' : '<';
    const value = cursor.v;
    const key = cursor.k;

    qb.andWhere(
      new Brackets((w) => {
        w.where(`user.${field} ${comparison} :cursorValue`, { cursorValue: value })
          .orWhere(
            `user.${field} = :cursorValue AND user.id ${comparison} :cursorKey`,
            { cursorValue: value, cursorKey: key },
          );
      }),
    );

    // NULLs sort last in a DESC keyset walk, so they are only ever reached
    // once no non-null value remains behind the cursor.
    if (value === null) {
      qb.andWhere(`user.${field} IS NOT NULL`);
    }

    buildStableOrder(qb, 'user', field, direction);
    qb.take(dto.limit + 1);

    const rows = await qb.getMany();
    return PaginatedResult.fromCursor(rows as UserDirectoryRow[], {
      limit: dto.limit,
      nextCursor: dto.cursor,
      encodeCursor: (row) => this.encodeCursor(row, field, direction),
    });
  }

  // --- helpers ------------------------------------------------------------

  private encodeCursor(row: UserDirectoryRow, sortBy: string, sortOrder: SortOrder): string {
    const field = assertSortableColumn(sortBy);
    const raw = (row as unknown as Record<string, unknown>)[field];
    const payload: CursorPayload = {
      f: field,
      d: sortOrder,
      v: raw instanceof Date ? raw.toISOString() : (raw as string | number | null) ?? null,
      k: row.id,
    };
    return this.cursors.encode(payload);
  }

  /**
   * Rejects inverted or nonsensical ranges up front.
   *
   * Without this, `createdFrom` after `createdTo` is silently an empty page,
   * which a caller cannot distinguish from "no users match". It is far more
   * likely a typo, so it is a 400 that names both bounds.
   */
  private assertDateRanges(dto: UserDirectoryQueryDto): void {
    const pairs: Array<{ from: string | undefined; to: string | undefined; fromKey: string; toKey: string }> = [
      { from: dto.createdFrom, to: dto.createdTo, fromKey: 'createdFrom', toKey: 'createdTo' },
      { from: dto.lastActiveFrom, to: dto.lastActiveTo, fromKey: 'lastActiveFrom', toKey: 'lastActiveTo' },
    ];

    for (const { from, to, fromKey, toKey } of pairs) {
      if (from && to && new Date(from) > new Date(to)) {
        throw new BadRequestApiException(`${fromKey} must not be after ${toKey}`, {
          [fromKey]: [from],
          [toKey]: [to],
        });
      }
    }
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
  }
}

export { SORTABLE_COLUMNS, ApiErrorCode };
