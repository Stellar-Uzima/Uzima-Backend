import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RedisClientType, createClient } from 'redis';
import { User } from '@/entities/user.entity';
import { UserStatusLog } from '@/entities/user-status-log.entity';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { Role } from '@modules/auth/enums/role.enum';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResource } from '@/audit/entities/audit-log.entity';
import { ApiErrorCode } from '@/common/errors/api-error-codes.enum';
import {
  ApiErrorException,
  ConflictApiException,
  NotFoundApiException,
} from '@/common/errors/api-error.exception';
import { PaginatedResult } from '@/common/pagination/paginated-result';
import {
  DeactivateUserDto,
  DeactivationReasonCode,
  DeactivationResultDto,
  ReactivateUserDto,
} from '../dto/deactivate-user.dto';
import { Session } from '@/database/entities/session.entity';

export interface ActorContext {
  id: string;
  role: Role;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * User deactivation and reactivation (#1291).
 *
 * Deactivation is a *soft, reversible, auditable* state change, not a delete:
 *
 * - The user row is kept. Wallet ledger entries, task completions and reward
 *   transactions reference it, so a hard delete would either cascade away
 *   financial history or fail on a foreign key. Deleting the row also breaks
 *   the append-only audit chain, which points at the id.
 * - Every change writes a `UserStatusLog` **and** an `AuditService` event, so
 *   there are two independent records: one queryable from the admin UI, one in
 *   the hash-chained compliance log.
 * - Sessions and refresh tokens are revoked, so deactivation takes effect
 *   immediately rather than when the access token happens to expire.
 *
 * Ordering note: the status update and the status-log insert share one
 * transaction, so a failed log write cannot leave a deactivated account with no
 * record of why.
 */
@Injectable()
export class UserDeactivationService {
  private readonly logger = new Logger(UserDeactivationService.name);
  private readonly redisClient: RedisClientType;

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(UserStatusLog) private readonly statusLogRepository: Repository<UserStatusLog>,
    @InjectRepository(Session) private readonly sessionsRepository: Repository<Session>,
    private readonly auditService: AuditService,
  ) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect().catch(() => undefined);
  }

  async deactivate(
    userId: string,
    dto: DeactivateUserDto,
    actor: ActorContext,
  ): Promise<DeactivationResultDto> {
    if (dto.reasonCode === DeactivationReasonCode.OTHER && !dto.reason?.trim()) {
      throw new ApiErrorException(
        ApiErrorCode.VALIDATION_FAILED,
        'reason is required when reasonCode is OTHER',
        { status: 400, details: { reason: ['Provide a short explanation'] } },
      );
    }

    if (!dto.confirm) {
      throw new ApiErrorException(
        ApiErrorCode.CONFIRMATION_REQUIRED,
        'Set confirm=true to deactivate this account',
        { status: 400, details: { confirm: ['Must be true'] } },
      );
    }

    if (actor.id === userId) {
      throw new ApiErrorException(
        ApiErrorCode.CANNOT_DEACTIVATE_SELF,
        'You cannot deactivate your own account',
        { status: 400 },
      );
    }

    const result = await this.usersRepository.manager.transaction(async (em: EntityManager) => {
      // Lock the row so two concurrent deactivations cannot both pass the
      // "already inactive" check below.
      const user = await em.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundApiException('User', userId, ApiErrorCode.USER_NOT_FOUND);
      }

      if (user.status === UserStatus.INACTIVE && !user.isActive) {
        throw new ConflictApiException(
          'Account is already deactivated',
          ApiErrorCode.ACCOUNT_ALREADY_INACTIVE,
        );
      }

      if (user.role === Role.ADMIN) {
        await this.assertNotLastAdmin(em, user);
      }

      const previousStatus = user.status;

      user.status = UserStatus.INACTIVE;
      user.isActive = false;
      // Clearing the refresh token is what actually ends the session: the
      // access token alone is not enough because /auth/refresh would otherwise
      // mint a fresh pair from the stored refresh token.
      user.refreshToken = null;
      user.refreshTokenExpiry = null;

      await em.getRepository(User).save(user);

      await em.getRepository(UserStatusLog).save(
        em.getRepository(UserStatusLog).create({
          userId: user.id,
          previousStatus,
          newStatus: UserStatus.INACTIVE,
          changedBy: actor.id,
          changedByRole: actor.role,
          reason: dto.reason?.trim() ?? `Deactivated (${dto.reasonCode})`,
          notes: dto.notes?.trim(),
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        }),
      );

      return { user, previousStatus };
    });

    // Cross-cutting side effects run after the transaction commits: a failure
    // here must not roll back a deactivation that is already recorded.
    const sessionsRevoked = await this.revokeSessions(userId);

    await this.auditService.logEvent({
      userId: actor.id,
      userRole: actor.role,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.USER,
      resourceId: result.user.id,
      resourceName: result.user.email,
      oldValues: { status: result.previousStatus, isActive: true },
      newValues: { status: UserStatus.INACTIVE, isActive: false },
      description: `Deactivated user ${result.user.email}`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      isSensitive: true,
      isComplianceEvent: true,
      complianceCategory: 'account_lifecycle',
      metadata: { reasonCode: dto.reasonCode, reason: dto.reason, sessionsRevoked },
    });

    return {
      userId: result.user.id,
      previousStatus: result.previousStatus,
      newStatus: UserStatus.INACTIVE,
      sessionsRevoked,
      dataRetained: true,
      changedAt: new Date(),
      changedBy: actor.id,
      changedByRole: actor.role,
      reasonCode: dto.reasonCode,
      reason: dto.reason?.trim(),
    };
  }

  async reactivate(
    userId: string,
    dto: ReactivateUserDto,
    actor: ActorContext,
  ): Promise<DeactivationResultDto> {
    if (!dto.confirm) {
      throw new ApiErrorException(
        ApiErrorCode.CONFIRMATION_REQUIRED,
        'Set confirm=true to reactivate this account',
        { status: 400, details: { confirm: ['Must be true'] } },
      );
    }

    const result = await this.usersRepository.manager.transaction(async (em: EntityManager) => {
      const user = await em.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundApiException('User', userId, ApiErrorCode.USER_NOT_FOUND);
      }

      if (user.status === UserStatus.ACTIVE && user.isActive) {
        throw new ConflictApiException('Account is already active', ApiErrorCode.ACCOUNT_ALREADY_ACTIVE);
      }

      // A compromise flag is not cleared by a single admin restoring the row.
      // This deliberately requires an out-of-band review, so the check is on
      // the recorded reason rather than the current status.
      const lastDeactivation = await em
        .getRepository(UserStatusLog)
        .findOne({ where: { userId, newStatus: UserStatus.INACTIVE }, order: { createdAt: 'DESC' } });

      if (lastDeactivation?.reason?.includes(DeactivationReasonCode.SUSPICIOUS_ACTIVITY)) {
        throw new ConflictApiException(
          'This account was deactivated for suspicious activity and needs a security review before it can be restored',
          ApiErrorCode.REACTIVATION_NOT_PERMITTED,
        );
      }

      const previousStatus = user.status;

      user.status = UserStatus.ACTIVE;
      user.isActive = true;
      // Reactivation does not restore the old session; the user signs in again
      // and gets a fresh token pair.
      user.refreshToken = null;
      user.refreshTokenExpiry = null;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;

      await em.getRepository(User).save(user);

      await em.getRepository(UserStatusLog).save(
        em.getRepository(UserStatusLog).create({
          userId: user.id,
          previousStatus,
          newStatus: UserStatus.ACTIVE,
          changedBy: actor.id,
          changedByRole: actor.role,
          reason: dto.reason?.trim() ?? 'Reactivated',
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        }),
      );

      return { user, previousStatus };
    });

    await this.auditService.logEvent({
      userId: actor.id,
      userRole: actor.role,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.USER,
      resourceId: result.user.id,
      resourceName: result.user.email,
      oldValues: { status: result.previousStatus, isActive: false },
      newValues: { status: UserStatus.ACTIVE, isActive: true },
      description: `Reactivated user ${result.user.email}`,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      isSensitive: true,
      isComplianceEvent: true,
      complianceCategory: 'account_lifecycle',
      metadata: { reason: dto.reason },
    });

    return {
      userId: result.user.id,
      previousStatus: result.previousStatus,
      newStatus: UserStatus.ACTIVE,
      sessionsRevoked: true,
      dataRetained: true,
      changedAt: new Date(),
      changedBy: actor.id,
      changedByRole: actor.role,
      reason: dto.reason?.trim(),
    };
  }

  async history(userId: string, limit = 20): Promise<PaginatedResult<UserStatusLog>> {
    const exists = await this.usersRepository.exist({ where: { id: userId } });
    if (!exists) {
      throw new NotFoundApiException('User', userId, ApiErrorCode.USER_NOT_FOUND);
    }

    const [rows, total] = await this.statusLogRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return PaginatedResult.of(rows, total, { page: 1, limit: Math.min(Math.max(limit, 1), 100) });
  }

  /**
   * Refuses to remove the final active admin.
   *
   * Without this, deactivating the last admin (or a mistaken bulk action) locks
   * everyone out of the admin API with no supported way back in.
   */
  private async assertNotLastAdmin(em: EntityManager, target: User): Promise<void> {
    const activeAdmins = await em.getRepository(User).count({
      where: { role: Role.ADMIN, status: UserStatus.ACTIVE, isActive: true },
    });

    if (activeAdmins <= 1) {
      throw new ConflictApiException(
        'Cannot deactivate the last active admin account',
        ApiErrorCode.CANNOT_DEACTIVATE_LAST_ADMIN,
      );
    }
  }

  /**
   * Drops persisted sessions and any cached session keys. Best effort: a Redis
   * outage must not fail the deactivation, because the database refresh-token
   * column is already cleared, which is what actually blocks token minting.
   */
  private async revokeSessions(userId: string): Promise<boolean> {
    try {
      // `userId` is the join column created by the @JoinColumn on Session.user.
      await this.sessionsRepository
        .createQueryBuilder()
        .delete()
        .where('"userId" = :userId', { userId })
        .execute();
    } catch (error) {
      this.logger.warn(
        `Could not delete sessions for ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }

    try {
      await this.redisClient.del(`session:${userId}`, `sessions:${userId}`, `user:${userId}:sessions`);
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not clear cached session keys for ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }
}
