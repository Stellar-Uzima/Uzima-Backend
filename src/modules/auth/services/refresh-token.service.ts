import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

export interface RotatedTokenPair {
  accessToken: string;
  refreshToken: string;
  familyId: string;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly refreshTokensRepo: RefreshTokensRepository,
    private readonly tokenIssuer: TokenIssuerService,
    private readonly auditService: AuditService,
  ) {}

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async issueInitialFamily(userId: string, sessionId: string): Promise<RotatedTokenPair> {
    const familyId = randomUUID();
    const tokenId = randomUUID();
    const rawRefreshToken = this.tokenIssuer.signRefreshToken({
      sub: userId,
      sid: sessionId,
      fid: familyId,
      jti: tokenId,
    });

    await this.refreshTokensRepo.create({
      id: tokenId,
      familyId,
      sessionId,
      userId,
      tokenHash: this.hashToken(rawRefreshToken),
      parentTokenId: null,
      rotatedAt: null,
      revokedAt: null,
      expiresAt: this.tokenIssuer.getRefreshTokenExpiry(),
    });

    const accessToken = await this.tokenIssuer.signAccessToken({
      sub: userId,
      sid: sessionId,
    });

    return { accessToken, refreshToken: rawRefreshToken, familyId };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<RotatedTokenPair> {
    const payload = await this.tokenIssuer.verifyRefreshToken(rawRefreshToken);
    const tokenHash = this.hashToken(rawRefreshToken);

    const record = await this.refreshTokensRepo.findById(payload.jti);
    if (!record || record.tokenHash !== tokenHash) {
      if (payload?.fid) {
        await this.refreshTokensRepo.revokeFamily(payload.fid, new Date());
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();

    // Reuse detection: token was already rotated or explicitly revoked
    if (record.rotatedAt || record.revokedAt) {
      await this.refreshTokensRepo.revokeFamily(record.familyId, now);
      await this.auditService.record({
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        actorId: record.userId,
        resourceId: record.familyId,
        metadata: {
          reusedTokenId: record.id,
          sessionId: record.sessionId,
        },
      });
      throw new UnauthorizedException('Refresh token reuse detected; token family revoked');
    }

    if (record.expiresAt <= now) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Atomically mark current token as rotated so concurrent replays fail
    const marked = await this.refreshTokensRepo.markRotatedIfActive(record.id, now);
    if (!marked) {
      await this.refreshTokensRepo.revokeFamily(record.familyId, now);
      throw new UnauthorizedException('Refresh token already consumed; token family revoked');
    }

    // Issue replacement token within the same family
    const nextTokenId = randomUUID();
    const nextRefreshToken = this.tokenIssuer.signRefreshToken({
      sub: record.userId,
      sid: record.sessionId,
      fid: record.familyId,
      jti: nextTokenId,
    });

    await this.refreshTokensRepo.create({
      id: nextTokenId,
      familyId: record.familyId,
      sessionId: record.sessionId,
      userId: record.userId,
      tokenHash: this.hashToken(nextRefreshToken),
      parentTokenId: record.id,
      rotatedAt: null,
      revokedAt: null,
      expiresAt: this.tokenIssuer.getRefreshTokenExpiry(),
    });

    const accessToken = await this.tokenIssuer.signAccessToken({
      sub: record.userId,
      sid: record.sessionId,
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      familyId: record.familyId,
    };
  }
}