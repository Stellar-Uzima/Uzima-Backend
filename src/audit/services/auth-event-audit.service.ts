import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import {
  AuthEventLog,
  AuthEventOutcome,
  AuthEventType,
} from '../../database/entities/auth-event.entity';

/** Default number of days an auth event is retained. */
export const DEFAULT_AUTH_EVENT_RETENTION_DAYS = 180;

export interface RecordAuthEventInput {
  eventType: AuthEventType;
  outcome?: AuthEventOutcome;
  userId?: string | null;
  userEmail?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuthEventQuery {
  page?: number;
  limit?: number;
  userId?: string;
  eventType?: AuthEventType;
  outcome?: AuthEventOutcome;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedAuthEvents {
  data: AuthEventLog[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/** Keys that must never be persisted into the metadata blob. */
const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'code',
  'totpcode',
  'secret',
  'twofactorsersecret',
  'authorization',
  'cookie',
  'passwordresettoken',
  'emailverificationtoken',
]);

/**
 * Replaces any sensitive value with a fixed marker.
 *
 * The metadata column is a `jsonb` blob that operators and downstream tooling
 * can read, so a shallow-and-deep scrub is applied before the row is written.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[truncated]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, val]) => {
        acc[key] = REDACTED_KEYS.has(key.toLowerCase())
          ? '[redacted]'
          : redact(val, depth + 1);
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }
  return value;
}

/**
 * Writes and reads the authentication audit trail (#1289).
 *
 * Recording is deliberately best-effort and never throws into the caller's
 * request path: a failure to persist an audit row must not turn a valid login
 * into a 500. Read access is exposed through an admin-only controller.
 */
@Injectable()
export class AuthEventAuditService {
  private readonly logger = new Logger(AuthEventAuditService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(AuthEventLog)
    private readonly authEventRepo: Repository<AuthEventLog>,
    configService?: ConfigService,
  ) {
    this.retentionDays =
      configService?.get<number>('AUTH_EVENT_RETENTION_DAYS') ??
      DEFAULT_AUTH_EVENT_RETENTION_DAYS;
  }

  /**
   * Persists a single auth event. Returns `null` (and logs) instead of
   * throwing when the write fails.
   */
  async record(input: RecordAuthEventInput): Promise<AuthEventLog | null> {
    try {
      const retentionExpiresAt = new Date();
      retentionExpiresAt.setDate(retentionExpiresAt.getDate() + this.retentionDays);

      const event = this.authEventRepo.create({
        userId: input.userId ?? null,
        userEmail: input.userEmail ? this.normaliseEmail(input.userEmail) : null,
        eventType: input.eventType,
        outcome: input.outcome ?? AuthEventOutcome.SUCCESS,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        metadata: input.metadata
          ? (redact(input.metadata) as Record<string, unknown>)
          : null,
        retentionExpiresAt,
      });

      return await this.authEventRepo.save(event);
    } catch (error) {
      this.logger.error(
        `Failed to record auth event ${input.eventType}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * The retention window, in days, currently applied to newly written rows.
   * Exposed so operators can verify the policy without reading the config.
   */
  get configuredRetentionDays(): number {
    return this.retentionDays;
  }

  /**
   * Convenience wrappers so call sites read declaratively and cannot forget the
   * outcome/reason pairing.
   */
  async recordSuccess(input: Omit<RecordAuthEventInput, 'outcome'>): Promise<AuthEventLog | null> {
    return this.record({ ...input, outcome: AuthEventOutcome.SUCCESS });
  }

  async recordFailure(
    input: Omit<RecordAuthEventInput, 'outcome'> & { reason: string },
  ): Promise<AuthEventLog | null> {
    return this.record({ ...input, outcome: AuthEventOutcome.FAILURE });
  }

  async recordDenied(
    input: Omit<RecordAuthEventInput, 'outcome'> & { reason: string },
  ): Promise<AuthEventLog | null> {
    return this.record({ ...input, outcome: AuthEventOutcome.DENIED });
  }

  /** Returns a filtered, paginated slice of the trail, newest first. */
  async findAll(query: AuthEventQuery = {}): Promise<PaginatedAuthEvents> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 50), 200);

    const builder = this.authEventRepo
      .createQueryBuilder('event')
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.userId) {
      builder.andWhere('event.userId = :userId', { userId: query.userId });
    }
    if (query.eventType) {
      builder.andWhere('event.eventType = :eventType', {
        eventType: query.eventType,
      });
    }
    if (query.outcome) {
      builder.andWhere('event.outcome = :outcome', { outcome: query.outcome });
    }
    if (query.startDate && query.endDate) {
      builder.andWhere('event.createdAt BETWEEN :start AND :end', {
        start: query.startDate,
        end: query.endDate,
      });
    } else if (query.startDate) {
      builder.andWhere('event.createdAt >= :start', { start: query.startDate });
    } else if (query.endDate) {
      builder.andWhere('event.createdAt <= :end', { end: query.endDate });
    }

    const [data, total] = await builder.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Per-user summary used by the admin account view: last successful login, last
   * failed attempt, and how many failures happened inside the lockout window.
   */
  async summariseForUser(
    userId: string,
  ): Promise<{
    lastLoginAt: Date | null;
    lastFailedLoginAt: Date | null;
    lastLogoutAt: Date | null;
    failedAttemptsInWindow: number;
  }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);

    const [lastLogin, lastFailure, lastLogout, recentFailures] = await Promise.all([
      this.authEventRepo.findOne({
        where: {
          userId,
          eventType: AuthEventType.LOGIN_SUCCESS,
        },
        order: { createdAt: 'DESC' },
      }),
      this.authEventRepo.findOne({
        where: {
          userId,
          eventType: AuthEventType.LOGIN_FAILURE,
        },
        order: { createdAt: 'DESC' },
      }),
      this.authEventRepo.findOne({
        where: { userId, eventType: AuthEventType.LOGOUT },
        order: { createdAt: 'DESC' },
      }),
      this.authEventRepo.count({
        where: {
          userId,
          eventType: AuthEventType.LOGIN_FAILURE,
          createdAt: Between(windowStart, now),
        },
      }),
    ]);

    return {
      lastLoginAt: lastLogin?.createdAt ?? null,
      lastFailedLoginAt: lastFailure?.createdAt ?? null,
      lastLogoutAt: lastLogout?.createdAt ?? null,
      failedAttemptsInWindow: recentFailures,
    };
  }

  /**
   * Applies the retention policy: deletes rows whose computed retention date has
   * passed, plus legacy rows written before that column existed.
   */
  async purgeExpired(): Promise<{ deletedCount: number; retentionDays: number }> {
    const now = new Date();
    const legacyCutoff = new Date();
    legacyCutoff.setDate(legacyCutoff.getDate() - this.retentionDays);

    const expired = await this.authEventRepo.find({
      where: [
        { retentionExpiresAt: LessThanOrEqual(now) },
        { retentionExpiresAt: IsNull(), createdAt: Between(new Date(0), legacyCutoff) },
      ],
      select: ['id'],
    });

    if (expired.length === 0) {
      return { deletedCount: 0, retentionDays: this.retentionDays };
    }

    const ids = expired.map((row) => row.id);
    const result = await this.authEventRepo.delete(ids);

    this.logger.log(
      `Purged ${result.affected ?? 0} auth event log(s) older than ${this.retentionDays} days`,
    );

    return { deletedCount: result.affected ?? 0, retentionDays: this.retentionDays };
  }

  private normaliseEmail(email: string): string {
    return email.trim().toLowerCase().slice(0, 320);
  }
}
