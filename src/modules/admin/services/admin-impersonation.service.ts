import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '@/entities/user.entity';
import { Role } from '@modules/auth/enums/role.enum';
import { CacheService } from '@/shared/cache/cache.service';
import { AuditService } from '@/audit/audit.service';
import { AuditAction, AuditResource } from '@/audit/entities/audit-log.entity';

export interface ImpersonationSession {
  id: string;
  adminId: string;
  targetUserId: string;
  expiry: string; // ISO String
  reason: string;
  isActive: boolean;
}

@Injectable()
export class AdminImpersonationService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly cacheService: CacheService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Starts an impersonation session
   */
  async startSession(
    adminId: string,
    targetUserId: string,
    expiry: Date,
    reason: string,
  ): Promise<ImpersonationSession> {
    const targetUser = await this.usersRepository.findOne({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (targetUser.role === Role.ADMIN) {
      throw new BadRequestException('Attempting to impersonate an admin user is rejected');
    }

    const now = new Date();
    if (expiry.getTime() <= now.getTime()) {
      throw new BadRequestException('Expiry time must be in the future');
    }

    const sessionId = randomUUID();
    const session: ImpersonationSession = {
      id: sessionId,
      adminId,
      targetUserId,
      expiry: expiry.toISOString(),
      reason,
      isActive: true,
    };

    const ttl = Math.ceil((expiry.getTime() - now.getTime()) / 1000);
    await this.cacheService.set(`impersonation:${sessionId}`, session, { ttl });

    await this.auditService.logEvent({
      userId: adminId,
      action: AuditAction.CREATE,
      resourceType: AuditResource.USER,
      resourceId: targetUserId,
      description: `Started impersonation session for user ${targetUserId}. Reason: ${reason}`,
      metadata: {
        sessionId,
        adminId,
        targetUserId,
        reason,
        expiry: expiry.toISOString(),
      },
    });

    return session;
  }

  /**
   * Ends an impersonation session early
   */
  async endSession(sessionId: string): Promise<ImpersonationSession> {
    const session = await this.cacheService.get<ImpersonationSession>(
      `impersonation:${sessionId}`,
    );

    if (!session || !session.isActive) {
      throw new BadRequestException('Session not found or already inactive');
    }

    session.isActive = false;
    // Overwrite the session in cache
    await this.cacheService.set(`impersonation:${sessionId}`, session);

    await this.auditService.logEvent({
      userId: session.adminId,
      action: AuditAction.UPDATE,
      resourceType: AuditResource.USER,
      resourceId: session.targetUserId,
      description: `Ended impersonation session early for user ${session.targetUserId}`,
      metadata: {
        sessionId,
        adminId: session.adminId,
        targetUserId: session.targetUserId,
        reason: session.reason,
      },
    });

    return session;
  }

  /**
   * Checks if an impersonation session is currently valid
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    const session = await this.cacheService.get<ImpersonationSession>(
      `impersonation:${sessionId}`,
    );

    if (!session) {
      return false;
    }

    if (!session.isActive) {
      return false;
    }

    const expiryDate = new Date(session.expiry);
    if (expiryDate.getTime() <= Date.now()) {
      return false;
    }

    return true;
  }
}
