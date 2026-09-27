import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenBlacklist, TokenType } from '@/database/entities/token-blacklist.entity';

export interface JwtPayload {
  /** The subject claim — typically the user's ID */
  sub: string;
  email: string;
  role?: string;
  /** JWT ID for token revocation tracking */
  jti?: string;
  /** Issuer claim */
  iss?: string;
  /** Audience claim */
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

/**
 * JWT Strategy for validating access tokens.
 * Verifies RS256 signature, expiration, issuer, audience, and checks revocation via TokenBlacklist.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepo: Repository<TokenBlacklist>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret-key',
      issuer: configService.get<string>('JWT_ISSUER', 'stellar-uzima'),
      audience: configService.get<string>('JWT_AUDIENCE', 'stellar-uzima-api'),
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // Check if access token is revoked
    if (payload.jti) {
      const blacklisted = await this.tokenBlacklistRepo.findOne({
        where: { token: payload.jti, tokenType: TokenType.ACCESS },
        select: ['id'],
      });

      if (blacklisted) {
        throw new UnauthorizedException('Access token has been revoked');
      }
    }

    // Attach token ID for revocation checking downstream
    const jti = payload.jti;
    
    // Return user context with token metadata for guards
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      jti,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  private hasExpectedAudience(
    aud: string | string[] | undefined,
    expected: string,
  ): boolean {
    if (aud === undefined) {
      return false;
    }
    return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
  }
}
