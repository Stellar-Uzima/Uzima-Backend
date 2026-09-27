import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenBlacklist, TokenType } from '@/database/entities/token-blacklist.entity';

/**
 * Guard that checks if an access token has been revoked (blacklisted).
 * Works in conjunction with JwtAuthGuard to provide immediate token revocation.
 */
@Injectable()
export class TokenRevocationGuard implements CanActivate {
  private readonly logger = new Logger(TokenRevocationGuard.name);

  constructor(
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepo: Repository<TokenBlacklist>,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return true; // Let JwtAuthGuard handle missing/invalid tokens
    }

    const token = authHeader.substring(7);

    try {
      // Check if token is blacklisted (fast DB lookup)
      const blacklisted = await this.tokenBlacklistRepo.findOne({
        where: { token, tokenType: TokenType.ACCESS },
        select: ['id'],
      });

      if (blacklisted) {
        this.logger.warn(`Rejected revoked access token for request to ${request.url}`);
        throw new UnauthorizedException('Access token has been revoked');
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Fail open on DB errors to avoid locking out users during outages
      this.logger.error(`Token revocation check failed: ${error.message}`);
      return true;
    }
  }
}
