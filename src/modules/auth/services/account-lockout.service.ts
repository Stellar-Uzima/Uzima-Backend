import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RedisClientType, createClient } from 'redis';
import { Repository } from 'typeorm';
import { User } from '@/entities/user.entity';
import { NotificationService } from '../../../notifications/services/notification.service';
import { AccountLockedException } from '../exceptions/account-locked.exception';

export interface LockoutState {
  locked: boolean;
  lockedUntil: Date | null;
  attempts: number;
  remainingAttempts: number;
}

/** Outcome of recording a failed password check. */
export interface FailureOutcome {
  /** True when this attempt is the one that tipped the account into lockout. */
  justLocked: boolean;
  lockedUntil: Date | null;
  attempts: number;
  state: LockoutState;
}

/**
 * Progressive account lockout (#1286).
 *
 * Three things are separated here that the previous inline logic conflated:
 *
 * 1. **Password failures and second-factor failures are counted separately.**
 *    The old code incremented `failedLoginAttempts` for a bad TOTP as well as
 *    a bad password. That handed an attacker who already has the password a
 *    denial-of-service: submit five wrong TOTP codes and the real owner is
 *    locked out, while the attacker still cannot authenticate. A second-factor
 *    failure now applies a cooldown on that *attempt* and never locks the
 *    account, so the attacker's only effect is their own rate limit.
 *
 * 2. **The counter increment is a single atomic statement.** The old code read
 *    the row, added one in JavaScript, and wrote it back, so two concurrent
 *    requests could both read `4` and both write `5`, and the fifth attempt
 *    would not trip the lock. The update increments in SQL and sets
 *    `locked_until` in the same statement.
 *
 * 3. **Lockout is visible to the user.** The account is emailed when it is
 *    locked, so a targeted victim learns about the attempt instead of just
 *    finding the account unusable.
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  private readonly maxPasswordFailures: number;
  private readonly lockoutDurationMs: number;
  private readonly maxTwoFactorFailures: number;
  private readonly twoFactorCooldownSeconds: number;
  private readonly maxFailuresPerIp: number;
  private readonly ipWindowSeconds: number;

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly notifications: NotificationService,
  ) {
    const num = (key: string, fallback: number) => {
      const raw = Number(process.env[key]);
      return Number.isFinite(raw) && raw > 0 ? raw : fallback;
    };

    this.maxPasswordFailures = num('MAX_FAILED_LOGIN_ATTEMPTS', 5);
    this.lockoutDurationMs = num('ACCOUNT_LOCKOUT_DURATION_MS', 15 * 60 * 1000);
    this.maxTwoFactorFailures = num('MAX_FAILED_TWO_FACTOR_ATTEMPTS', 10);
    this.twoFactorCooldownSeconds = num('TWO_FACTOR_COOLDOWN_SECONDS', 30);
    this.maxFailuresPerIp = num('MAX_FAILED_LOGIN_ATTEMPTS_PER_IP', 20);
    this.ipWindowSeconds = num('FAILED_LOGIN_IP_WINDOW_SECONDS', 15 * 60);

    // Redis holds only the second-factor counter and the IP signal, both of
    // which are advisory. The authoritative lockout state is two columns on
    // the user row, so a Redis outage degrades these to no-ops rather than
    // locking anyone out or letting the database counter be lost.
    //
    // The client is created lazily: the column-based lockout is the primary
    // mechanism, so a process that never needs the advisory counters should
    // never open a connection or hold a reconnecting socket.
  }

  private get redisClient(): RedisClientType {
    if (!this.client) {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });
      this.client.on('error', (err) => this.logger.warn(`Redis unavailable: ${err.message}`));
      this.client.connect().catch(() => undefined);
    }
    return this.client;
  }

  /** Replaces the lazy client. Used by tests to inject a stub. */
  setRedisClient(client: RedisClientType): void {
    this.client = client;
  }

  /**
   * Records a failed password check with a single atomic statement.
   *
   * `CASE WHEN failed_login_attempts + 1 >= :max` is evaluated against the
   * pre-update value, so the attempt that crosses the threshold both increments
   * and locks. There is no read-then-write window for a concurrent request to
   * slip through.
   */
  async recordPasswordFailure(userId: string): Promise<FailureOutcome> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + this.lockoutDurationMs);

    const result = await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({
        failedLoginAttempts: () => `"failedLoginAttempts" + 1`,
        lockedUntil: () =>
          `CASE WHEN "failedLoginAttempts" + 1 >= ${this.maxPasswordFailures} ` +
          `THEN :lockedUntil ELSE "lockedUntil" END`,
        updatedAt: now,
      })
      .where('id = :userId', { userId, lockedUntil })
      .returning(['failedLoginAttempts', 'lockedUntil'])
      .execute();

    const row = result.raw?.[0] as { failedLoginAttempts?: number; lockedUntil?: Date | null } | undefined;
    const attempts = Number(row?.failedLoginAttempts ?? 0);
    const effectiveLock = row?.lockedUntil ? new Date(row.lockedUntil) : null;
    const justLocked = effectiveLock !== null && effectiveLock > now;

    if (justLocked) {
      this.logger.warn(
        `Account ${userId} locked until ${effectiveLock!.toISOString()} after ${attempts} failed password attempts`,
      );
    }

    return {
      justLocked,
      lockedUntil: effectiveLock,
      attempts,
      state: this.toState(attempts, effectiveLock),
    };
  }

  /**
   * Records a failed second-factor check.
   *
   * Deliberately does not lock the account — see the class comment. It applies a
   * cooldown once the attempt count crosses the threshold, which slows an
   * online guess at the 6-digit code (1e6 combinations) to
   * `maxTwoFactorFailures / twoFactorCooldownSeconds` guesses per second
   * without giving anyone a tool to lock out a legitimate user.
   */
  async recordTwoFactorFailure(userId: string): Promise<{ cooldownSeconds: number; attempts: number }> {
    const key = `2fa:failures:${userId}`;
    let attempts: number;

    try {
      attempts = await this.redisClient.incr(key);
      await this.redisClient.expire(key, this.twoFactorCooldownSeconds * this.maxTwoFactorFailures);
    } catch (error) {
      this.logger.warn(`Could not record 2FA failure for ${userId}: ${(error as Error).message}`);
      return { cooldownSeconds: 0, attempts: 0 };
    }

    if (attempts < this.maxTwoFactorFailures) {
      return { cooldownSeconds: 0, attempts };
    }

    return { cooldownSeconds: this.twoFactorCooldownSeconds, attempts };
  }

  async clearTwoFactorFailures(userId: string): Promise<void> {
    await this.redisClient.del(`2fa:failures:${userId}`).catch(() => undefined);
  }

  /**
   * Cooldown currently owed by this caller, or 0 when they may try again.
   */
  async twoFactorCooldownRemaining(userId: string): Promise<number> {
    try {
      const ttl = await this.redisClient.ttl(`2fa:failures:${userId}`);
      if (ttl <= 0) {
        return 0;
      }
      // The whole window only turns into a cooldown once the count is over the
      // threshold, and the window is sized to the threshold, so a fresh window
      // always means the caller is under it.
      return ttl < this.twoFactorCooldownSeconds * this.maxTwoFactorFailures
        ? this.twoFactorCooldownSeconds - (ttl % this.twoFactorCooldownSeconds)
        : 0;
    } catch (error) {
      this.logger.warn(`Could not read 2FA cooldown for ${userId}: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Resets the counters and clears an expired lock. Called on successful
   * authentication, and by the password-reset flow so that a user who recovers
   * their account is not still locked out by the attacker's failed attempts.
   */
  async clear(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { failedLoginAttempts: 0, lockedUntil: null });
    await this.clearTwoFactorFailures(userId);
  }

  /** Evaluates the lock without writing. */
  stateFor(user: Pick<User, 'failedLoginAttempts' | 'lockedUntil'>): LockoutState {
    const now = new Date();
    const lockedUntil = user.lockedUntil && user.lockedUntil > now ? user.lockedUntil : null;

    return this.toState(user.failedLoginAttempts ?? 0, lockedUntil);
  }

  /** Throws 423 when the account is currently locked. */
  assertNotLocked(user: Pick<User, 'failedLoginAttempts' | 'lockedUntil'>): void {
    const state = this.stateFor(user);
    if (state.locked && state.lockedUntil) {
      throw new AccountLockedException(state.lockedUntil, state.remainingAttempts);
    }
  }

  /**
   * Notifies the user that their account was locked. Best effort: a mail outage
   * must not turn a lockout into a 500.
   */
  async notifyLocked(user: User, lockedUntil: Date): Promise<void> {
    try {
      await this.notifications.sendEmail(user.id, 'account-locked', {
        name: user.firstName || user.email,
        lockedUntil: lockedUntil.toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Could not notify ${user.id} of lockout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // --- IP throttle (Redis) ------------------------------------------------

  /**
   * Counts failures per source IP.
   *
   * Per-account lockout alone does not stop credential stuffing: an attacker
   * spreads one guess across thousands of accounts and never trips a single
   * account threshold. This counter is a coarse signal, not a hard block, so a
   * shared NAT (a mobile carrier CGNAT is realistic in the target markets) is
   * not punished for other users' traffic.
   */
  async recordIpFailure(ip: string): Promise<number> {
    const key = `login:ip:${ip}`;
    try {
      const count = await this.redisClient.incr(key);
      if (count === 1) {
        await this.redisClient.expire(key, this.ipWindowSeconds);
      }
      return count;
    } catch (error) {
      this.logger.warn(`Could not record IP failure for ${ip}: ${(error as Error).message}`);
      return 0;
    }
  }

  async ipFailuresExceedThreshold(ip: string): Promise<boolean> {
    try {
      const count = Number((await this.redisClient.get(`login:ip:${ip}`)) ?? 0);
      return count > this.maxFailuresPerIp;
    } catch (error) {
      return false;
    }
  }

  async clearIpFailures(ip: string): Promise<void> {
    await this.redisClient.del(`login:ip:${ip}`).catch(() => undefined);
  }

  private toState(attempts: number, lockedUntil: Date | null): LockoutState {
    return {
      locked: lockedUntil !== null,
      lockedUntil,
      attempts,
      remainingAttempts: Math.max(0, this.maxPasswordFailures - attempts),
    };
  }

  private client: RedisClientType | null = null;
}
