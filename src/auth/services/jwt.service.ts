import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  TokenPayload,
  TokenPair,
  ValidatedToken,
} from '../../../common/interfaces/token.interface';

@Injectable()
export class JwtTokenService {
  private readonly logger = new Logger(JwtTokenService.name);

  private readonly privateKey: string;
  private readonly publicKey: string;

  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  constructor(private readonly configService: ConfigService) {
    this.privateKey = this.configService.get<string>('JWT_PRIVATE_KEY', '').replace(/\\n/g, '\n');
    this.publicKey = this.configService.get<string>('JWT_PUBLIC_KEY', '').replace(/\\n/g, '\n');
  }

  /**
   * Generates a short-lived access token (15 minutes).
   */
  generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });
  }

  /**
   * Generates a long-lived refresh token (7 days).
   */
  generateRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });
  }

  /**
   * Generates both access and refresh tokens in a single call.
   */
  generateTokenPair(payload: Omit<TokenPayload, 'iat' | 'exp'>): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * Validates a JWT token and returns the decoded payload or null.
   * Never throws — all errors are captured in the ValidatedToken shape.
   */
  validateToken(token: string): ValidatedToken {
    try {
      const payload = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      }) as TokenPayload;

      return { payload, expired: false };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        this.logger.warn('Token has expired');
        return { payload: null, expired: true, error: 'Token expired' };
      }

      this.logger.warn('Token validation failed', error?.message);
      return { payload: null, expired: false, error: error?.message ?? 'Invalid token' };
    }
  }

  /**
   * Rotates a refresh token — validates the old one and, if valid,
   * issues a new access + refresh pair.
   */
  refreshTokenPair(refreshToken: string): TokenPair | null {
    const { payload, expired, error } = this.validateToken(refreshToken);

    if (!payload || expired) {
      this.logger.warn('Refresh token rejected', error);
      return null;
    }

    const { iat, exp, ...rest } = payload;
    return this.generateTokenPair(rest);
  }
}
