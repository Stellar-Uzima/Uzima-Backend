import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET', 'secretKey'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    if (!payload.tokenId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenId: payload.tokenId,
    };
  }
}
