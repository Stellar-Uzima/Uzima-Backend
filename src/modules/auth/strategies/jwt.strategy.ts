import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import {
  buildJwtSecurityConfig,
  JwtSecurityConfig,
  resolveJwtSecurityConfig,
} from '../../../config/jwt.config';

export interface JwtPayload {
  /** The subject claim — typically the user's ID */
  sub: string;
  email: string;
  roles?: string[];
  /** Token id. Enables per-token revocation. */
  jti?: string;
  /** Issuer, validated against {@link JwtSecurityConfig.issuer}. */
  iss?: string;
  /** Audience, validated against {@link JwtSecurityConfig.audience}. */
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

/**
 * Validates the bearer access token.
 *
 * Hardening applied for #1287:
 *  - `algorithms` is pinned to HS256 so a token signed with `none` or an
 *    asymmetric algorithm cannot be substituted.
 *  - `issuer` and `audience` are asserted by passport-jwt itself, so a token
 *    minted for a different service (or a stale one) never reaches business
 *    logic.
 *  - `ignoreExpiration` stays `false` and a small `clockTolerance` absorbs
 *    drift between nodes.
 *  - `validate()` performs a second, explicit claim check. `passport-jwt`
 *    already rejects a bad `iss`/`aud`, but it does not guarantee `sub` is
 *    present, and a token with no subject cannot be authorised.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly securityConfig: JwtSecurityConfig;

  constructor(private readonly configService: ConfigService) {
    const securityConfig = resolveJwtSecurityConfig(
      configService.get('jwt'),
      process.env,
    );

    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret-key',
      issuer: securityConfig.issuer,
      audience: securityConfig.audience,
      algorithms: securityConfig.algorithms,
      clockTolerance: securityConfig.clockTolerance,
    };

    super(options);

    this.securityConfig = securityConfig;
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Token is missing a subject claim');
    }

    // Belt-and-braces: passport-jwt checks these, but assert again so a
    // misconfigured future strategy cannot silently drop the guarantee.
    if (payload.iss !== this.securityConfig.issuer) {
      throw new UnauthorizedException('Token issuer is not recognised');
    }

    if (!this.hasExpectedAudience(payload.aud, this.securityConfig.audience)) {
      throw new UnauthorizedException('Token audience is not recognised');
    }

    if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Token has expired');
    }

    return {
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role: payload.roles?.[0],
      roles: payload.roles,
      jti: payload.jti,
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
