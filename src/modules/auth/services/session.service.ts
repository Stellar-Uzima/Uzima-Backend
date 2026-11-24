import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export interface RevokeSessionActor {
  userId: string;
  roles: string[];
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepo: SessionsRepository,
    private readonly auditService: AuditService,
  ) {}

  async revokeSession(
    sessionId: string,
    actor: RevokeSessionActor,
    reason = 'USER_REVOKED',
  ): Promise<{ sessionId: string; revoked: boolean; alreadyRevoked: boolean }> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const isOwner = session.userId === actor.userId;
    const isAdmin = actor.roles.includes('ADMIN') || actor.roles.includes('SUPER_ADMIN');

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Not authorized to revoke this session');
    }

    if (session.revokedAt) {
      return { sessionId: session.id, revoked: true, alreadyRevoked: true };
    }

    const revokedAt = new Date();
    await this.sessionsRepo.markRevoked(session.id, {
      revokedAt,
      revokedBy: actor.userId,
      revokeReason: isAdmin && !isOwner ? `ADMIN:${reason}` : reason,
    });

    // Optional: also invalidate/blacklist associated refresh token/session key in cache/store
    await this.auditService.record({
      action: 'AUTH_SESSION_REVOKED',
      actorId: actor.userId,
      targetUserId: session.userId,
      resourceId: session.id,
      metadata: {
        revokedByAdmin: isAdmin && !isOwner,
        reason,
      },
    });

    return { sessionId: session.id, revoked: true, alreadyRevoked: false };
  }

  async assertSessionActive(sessionId: string): Promise<void> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }
  }
}