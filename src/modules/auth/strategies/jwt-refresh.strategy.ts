import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecurityConfig } from '../../../config/jwt.config';

export interface JwtRefreshPayload {
  sub: string;
  email: string;
  role: string;
  /** Session-scoped token id, used to key the Redis refresh entry. */
  tokenId: string;
  jti?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

/**
 * Validates refresh tokens.
 *
 * Refresh tokens are the high-value credential: they are exchanged for new
 * access tokens, so accepting a loosely verified one is worse than accepting a
 * bad access token. The strategy therefore pins the algorithm, asserts the
 * issuer, and requires the refresh audience (which defaults to, but may differ
 * from, the access audience so a refresh token can never be replayed as an
 * access token).
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    const securityConfig = resolveJwtSecurityConfig(
      configService.get('jwt'),
      process.env,
    );

    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') ||
        configService.get<string>('JWT_SECRET') || 'secretKey',
      ignoreExpiration: false,
      issuer: securityConfig.issuer,
      audience: securityConfig.refreshAudience,
      algorithms: securityConfig.algorithms,
      clockTolerance: securityConfig.clockTolerance,
    };

    super(options);
  }

  async validate(payload: JwtRefreshPayload) {
    if (!payload.tokenId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenId: payload.tokenId,
      jti: payload.jti,
    };
  }
}
