import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { TokenBlacklist } from '../../../database/entities/token-blacklist.entity';

/**
 * Shape of the request after `JwtAuthGuard` has populated it. The Passport
 * strategy copies the validated token claims onto `request.user`, so the
 * original raw token and its `jti` are carried alongside the identity.
 */
export interface RevocableRequest {
  user?: Record<string, unknown> | null;
  headers?: Record<string, unknown>;
}

/**
 * Rejects revoked access tokens before the request reaches business logic.
 *
 * Logout only ever blacklists the *refresh* token, which means a stolen access
 * token stays usable for its full lifetime. This guard closes that window by
 * checking the blacklisting tables on every protected request.
 *
 * Two things are consulted:
 *  1. `token_blacklist.token` — an exact match on the presented token string.
 *  2. `revoked_access_tokens.jti` — a match on the token id, so every token
 *     minted in the same session for the same user can be invalidated at once
 *     (used for "log out everywhere" and for account deactivation).
 *
 * Short-lived caching keeps this off the hot path; a miss is only cached for a
 * few seconds so a revocation takes effect almost immediately.
 */
@Injectable()
export class TokenRevocationGuard implements CanActivate {
  private readonly logger = new Logger(TokenRevocationGuard.name);

  /** How long a "not revoked" answer is trusted before re-checking the DB. */
  private static readonly ALLOW_CACHE_TTL_MS = 5_000;

  /** Upper bound on the in-process allow cache so it cannot grow unbounded. */
  private static readonly MAX_ALLOW_CACHE_ENTRIES = 10_000;

  private readonly allowCache = new Map<string, number>();

  constructor(
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepo: Repository<TokenBlacklist>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only HTTP requests carry a bearer token; other transports pass through.
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<RevocableRequest>();
    const rawToken = this.extractBearerToken(request);

    // Nothing to check: either the route is public or a different guard owns
    // authentication. Never fail here — this guard is additive.
    if (!rawToken) {
      return true;
    }

    const jti = this.extractJti(request);
    const cacheKey = jti ?? rawToken;

    if (this.isCachedAllow(cacheKey)) {
      return true;
    }

    if (await this.isRevoked(rawToken, jti)) {
      this.logger.warn(`Rejected revoked access token (jti=${jti ?? 'unknown'})`);
      throw new UnauthorizedException('Token has been revoked');
    }

    this.cacheAllow(cacheKey);
    return true;
  }

  /**
   * Drops the cached "valid" verdict for a user so a freshly revoked token is
   * rejected on the very next request. Called by the auth service on logout
   * and whenever an account is disabled.
   */
  invalidateForTokens(tokens: Array<string | null | undefined>): void {
    for (const token of tokens) {
      if (token) {
        this.allowCache.delete(token);
      }
    }
  }

  /** Clears the whole allow cache. */
  clearCache(): void {
    this.allowCache.clear();
  }

  private async isRevoked(rawToken: string, jti: string | undefined): Promise<boolean> {
    const blacklisted = await this.tokenBlacklistRepo.findOne({
      where: { token: rawToken },
    });

    if (blacklisted) {
      return true;
    }

    // `jti` is only set on tokens minted after the hardening change, so an
    // absent value simply means there is nothing further to check.
    if (!jti) {
      return false;
    }

    const byJti = await this.tokenBlacklistRepo.findOne({
      where: { token: `jti:${jti}` },
    });

    return !!byJti;
  }

  private isCachedAllow(cacheKey: string): boolean {
    const expiresAt = this.allowCache.get(cacheKey);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= Date.now()) {
      this.allowCache.delete(cacheKey);
      return false;
    }
    return true;
  }

  private cacheAllow(cacheKey: string): void {
    if (this.allowCache.size >= TokenRevocationGuard.MAX_ALLOW_CACHE_ENTRIES) {
      this.pruneCache();
    }
    this.allowCache.set(cacheKey, Date.now() + TokenRevocationGuard.ALLOW_CACHE_TTL_MS);
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.allowCache.entries()) {
      if (expiresAt <= now) {
        this.allowCache.delete(key);
      }
    }
    // Still oversized (everything fresh): drop the oldest half.
    if (this.allowCache.size >= TokenRevocationGuard.MAX_ALLOW_CACHE_ENTRIES) {
      const keys = Array.from(this.allowCache.keys()).slice(
        0,
        Math.floor(TokenRevocationGuard.MAX_ALLOW_CACHE_ENTRIES / 2),
      );
      for (const key of keys) {
        this.allowCache.delete(key);
      }
    }
  }

  private extractBearerToken(request: RevocableRequest): string | undefined {
    const header = request.headers?.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }
    const [scheme, value] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) {
      return undefined;
    }
    return value.trim();
  }

  private extractJti(request: RevocableRequest): string | undefined {
    const jti = request.user?.jti;
    return typeof jti === 'string' && jti.length > 0 ? jti : undefined;
  }

  /**
   * Helper used by the auth service when it wants to revoke every token issued
   * for a session without knowing the individual token strings.
   */
  static jtiBlacklistEntry(userId: string, jti: string, expiresAt: Date) {
    return {
      token: `jti:${jti}`,
      tokenType: 'access' as const,
      userId,
      expiresAt,
    };
  }
}

/** Convenience re-export so callers can purge stale rows on a schedule. */
export const deleteExpiredBlacklistEntries = (repo: Repository<TokenBlacklist>) =>
  repo.delete({ expiresAt: LessThan(new Date()) });
