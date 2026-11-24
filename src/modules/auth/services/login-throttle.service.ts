import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisClientType, createClient } from 'redis';
import { LoginThrottledException } from '../exceptions/login-throttled.exception';

/**
 * Throttles repeated failed login attempts (#1469).
 *
 * Two independent counters are kept, both inside the same sliding-start window:
 *
 * - **Identity**: failures for one email address. Stops guessing against a
 *   single account.
 * - **Client**: failures from one source IP across *all* addresses. Stops
 *   credential stuffing, where one guess is spread over many accounts and no
 *   single identity counter ever fills up.
 *
 * Either counter reaching its limit blocks the attempt before the user lookup
 * runs. Because the check happens first and counts failures for unknown
 * addresses exactly like known ones, the throttled response (and the moment it
 * starts) is the same whether or not an account exists.
 *
 * This is separate from account lockout ({@link AccountLockoutService}):
 * lockout is a persisted state on a real user row, whereas this limiter is
 * ephemeral, keyed on whatever address was typed, and cannot be used to
 * discover which addresses are registered.
 *
 * Redis failures fail open with a warning. The limiter is a defence layer, and
 * a Redis outage must not turn into a login outage for every user.
 *
 * Configuration (environment):
 * - `LOGIN_THROTTLE_IDENTITY_MAX_ATTEMPTS` failures per identity (default 5)
 * - `LOGIN_THROTTLE_CLIENT_MAX_ATTEMPTS` failures per client IP (default 20)
 * - `LOGIN_THROTTLE_WINDOW_SECONDS` window length in seconds (default 900)
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  private readonly maxIdentityAttempts: number;
  private readonly maxClientAttempts: number;
  private readonly windowSeconds: number;

  private client: RedisClientType | null = null;

  constructor() {
    const num = (key: string, fallback: number) => {
      const raw = Number(process.env[key]);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
    };

    this.maxIdentityAttempts = num('LOGIN_THROTTLE_IDENTITY_MAX_ATTEMPTS', 5);
    this.maxClientAttempts = num('LOGIN_THROTTLE_CLIENT_MAX_ATTEMPTS', 20);
    this.windowSeconds = num('LOGIN_THROTTLE_WINDOW_SECONDS', 15 * 60);
  }

  /** Lazily opened so a process that never logs anyone in opens no socket. */
  private get redisClient(): RedisClientType {
    if (!this.client) {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });
      this.client.on('error', (err: Error) =>
        this.logger.warn(`Redis unavailable: ${err.message}`)
      );
      this.client.connect().catch(() => undefined);
    }
    return this.client;
  }

  /** Replaces the lazy client. Used by tests to inject a stub. */
  setRedisClient(client: RedisClientType): void {
    this.client = client;
  }

  /**
   * Throws {@link LoginThrottledException} when the identity or the client has
   * used up its failure budget for the current window.
   *
   * @param identity - Normalised email address as typed by the caller. It does
   *   not need to belong to a registered account.
   * @param clientIp - Caller IP, when known.
   */
  async assertAllowed(identity: string, clientIp?: string): Promise<void> {
    const checks: Array<{ key: string; max: number }> = [
      { key: this.identityKey(identity), max: this.maxIdentityAttempts },
    ];
    if (clientIp) {
      checks.push({ key: this.clientKey(clientIp), max: this.maxClientAttempts });
    }

    let retryAfter = 0;

    for (const { key, max } of checks) {
      try {
        const count = Number((await this.redisClient.get(key)) ?? 0);
        if (count >= max) {
          const ttl = await this.redisClient.ttl(key);
          if (ttl === -1) {
            // The counter exists but has no expiry (the process died between
            // INCR and EXPIRE). Without this it would throttle forever.
            await this.redisClient.expire(key, this.windowSeconds);
          }
          // A negative TTL means the key is missing or was just given its
          // expiry; fall back to the full window so the caller still gets a
          // usable instruction.
          retryAfter = Math.max(retryAfter, ttl > 0 ? ttl : this.windowSeconds);
        }
      } catch (error) {
        this.logger.warn(`Could not read login throttle state: ${(error as Error).message}`);
      }
    }

    if (retryAfter > 0) {
      throw new LoginThrottledException(retryAfter);
    }
  }

  /**
   * Records one failed attempt against the identity and the client. Call this
   * for every failed credential check, including for addresses that have no
   * account, so the two cases are indistinguishable from outside.
   */
  async recordFailure(identity: string, clientIp?: string): Promise<void> {
    await this.increment(this.identityKey(identity));
    if (clientIp) {
      await this.increment(this.clientKey(clientIp));
    }
  }

  /**
   * Clears the identity counter after a successful login. The client counter is
   * left to expire on its own: otherwise an attacker who owns one valid account
   * could reset their budget by logging in to it between guesses.
   */
  async clearIdentity(identity: string): Promise<void> {
    try {
      await this.redisClient.del(this.identityKey(identity));
    } catch (error) {
      this.logger.warn(`Could not clear login throttle state: ${(error as Error).message}`);
    }
  }

  private async increment(key: string): Promise<void> {
    try {
      const count = await this.redisClient.incr(key);
      if (count === 1) {
        await this.redisClient.expire(key, this.windowSeconds);
      }
    } catch (error) {
      this.logger.warn(`Could not record login failure: ${(error as Error).message}`);
    }
  }

  /** Hashed so email addresses are not stored in Redis in the clear. */
  private identityKey(identity: string): string {
    const digest = createHash('sha256').update(identity.trim().toLowerCase()).digest('hex');
    return `login:throttle:id:${digest}`;
  }

  private clientKey(ip: string): string {
    return `login:throttle:ip:${ip}`;
  }
}
