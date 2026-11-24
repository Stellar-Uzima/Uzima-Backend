import { Repository } from 'typeorm';
import { User } from '@/entities/user.entity';
import { AccountLockoutService } from './account-lockout.service';
import { AccountLockedException } from '../exceptions/account-locked.exception';

/** Captures the single UPDATE statement the service issues. */
function makeRepo(result: { attempts: number; lockedUntil: Date | null }) {
  // The service builds `createQueryBuilder().update(User).set(...).where(...)`,
  // so every link in the chain has to hand the builder back.
  const qb: Record<string, jest.Mock> = {};
  const set = jest.fn(() => qb);
  const where = jest.fn().mockReturnValue({
    returning: () => ({ execute: async () => ({ raw: [{ failedLoginAttempts: result.attempts, lockedUntil: result.lockedUntil }] }) }),
  });
  Object.assign(qb, { update: jest.fn(() => qb), set, where });

  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const find = jest.fn().mockResolvedValue([]);

  return {
    repo: { createQueryBuilder: () => qb, update, find } as unknown as Repository<User>,
    qb,
    set,
    where,
    update,
    find,
  };
}

function makeService(result: { attempts: number; lockedUntil: Date | null } = { attempts: 1, lockedUntil: null }) {
  const { repo, qb, set, where, update, find } = makeRepo(result);
  const notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const authEvents = { record: jest.fn().mockResolvedValue(null) };

  const service = new AccountLockoutService(repo, notifications as never, authEvents as never);

  // Replace the Redis client: the counter is advisory, and the tests are about
  // the SQL statement and the state machine, not the transport. Injecting also
  // keeps the lazy client from opening a real connection.
  const client = {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  };
  service.setRedisClient(client as never);

  return { service, qb, set, where, update, find, notifications, authEvents, client };
}

describe('AccountLockoutService (#1286)', () => {
  describe('recordPasswordFailure', () => {
    it('increments and locks in one statement, not a read-then-write', async () => {
      const { service, qb } = makeService({ attempts: 5, lockedUntil: new Date(Date.now() + 900_000) });

      await service.recordPasswordFailure('u1');

      // A single UPDATE. The previous implementation read the row, added one
      // in JavaScript and wrote it back, so two concurrent requests could both
      // read 4, both write 5, and the fifth attempt would not trip the lock.
      expect(qb.set).toHaveBeenCalledTimes(1);
      expect(qb.where).toHaveBeenCalledTimes(1);
    });

    it('increments the column in SQL rather than passing a precomputed value', async () => {
      const { service, set } = makeService();

      await service.recordPasswordFailure('u1');

      const patch = set.mock.calls[0][0];
      expect(typeof patch.failedLoginAttempts).toBe('function');
      expect(patch.failedLoginAttempts()).toMatch(/failedLoginAttempts.*\+ 1/);
    });

    it('sets lockedUntil conditionally so a below-threshold attempt leaves it alone', async () => {
      const { service, set } = makeService();

      await service.recordPasswordFailure('u1');

      expect(set.mock.calls[0][0].lockedUntil()).toMatch(/CASE WHEN/);
    });

    it('flags the attempt that trips the lock so the user can be notified', async () => {
      const lockedUntil = new Date(Date.now() + 900_000);
      const { service } = makeService({ attempts: 5, lockedUntil });

      const outcome = await service.recordPasswordFailure('u1');

      expect(outcome.justLocked).toBe(true);
      expect(outcome.lockedUntil).toEqual(lockedUntil);
    });

    it('does not report justLocked for a sub-threshold attempt', async () => {
      const { service } = makeService({ attempts: 2, lockedUntil: null });

      const outcome = await service.recordPasswordFailure('u1');

      expect(outcome.justLocked).toBe(false);
      expect(outcome.state.locked).toBe(false);
      expect(outcome.state.remainingAttempts).toBeGreaterThan(0);
    });
  });

  describe('second-factor failures are counted separately', () => {
    it('never touches the account lockout columns', async () => {
      const { service, qb } = makeService();

      await service.recordTwoFactorFailure('u1');

      // This is the fix for a denial-of-service: the old code incremented
      // failedLoginAttempts for a bad TOTP, so anyone who already knew the
      // password could lock the real owner out with five wrong codes.
      expect(qb.set).not.toHaveBeenCalled();
    });

    it('returns no cooldown below the threshold', async () => {
      const { service, client } = makeService();
      client.incr = jest.fn().mockResolvedValue(3);

      await expect(service.recordTwoFactorFailure('u1')).resolves.toEqual({
        cooldownSeconds: 0,
        attempts: 3,
      });
    });

    it('applies a cooldown at the threshold instead of locking the account', async () => {
      const { service, client } = makeService();
      client.incr = jest.fn().mockResolvedValue(999);

      const result = await service.recordTwoFactorFailure('u1');

      expect(result.cooldownSeconds).toBeGreaterThan(0);
    });

    it('degrades to no cooldown when Redis is unavailable', async () => {
      const { service, client } = makeService();
      client.incr = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.recordTwoFactorFailure('u1')).resolves.toEqual({
        cooldownSeconds: 0,
        attempts: 0,
      });
    });
  });

  describe('assertNotLocked', () => {
    it('throws 423 with a retry hint while the lock is live', () => {
      const { service } = makeService();
      const lockedUntil = new Date(Date.now() + 600_000);

      expect(() =>
        service.assertNotLocked({ failedLoginAttempts: 5, lockedUntil }),
      ).toThrow(AccountLockedException);
    });

    it('does not throw once the lock has expired', () => {
      const { service } = makeService();

      expect(() =>
        service.assertNotLocked({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) }),
      ).not.toThrow();
    });

    it('does not throw for a user with no lock', () => {
      const { service } = makeService();

      expect(() =>
        service.assertNotLocked({ failedLoginAttempts: 0, lockedUntil: null }),
      ).not.toThrow();
    });
  });

  describe('AccountLockedException', () => {
    it('exposes retryAfterSeconds and the unlock instant', () => {
      const lockedUntil = new Date(Date.now() + 600_000);
      const body = new AccountLockedException(lockedUntil, 0).getResponse() as Record<string, unknown>;

      expect(body.code).toBe('ACCOUNT_LOCKED');
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.lockedUntil).toBe(lockedUntil.toISOString());
    });
  });

  describe('notifyLocked', () => {
    it('tells the user their account was locked', async () => {
      const { service, notifications } = makeService();

      await service.notifyLocked({ id: 'u1', email: 'a@b.c', firstName: 'Ada' } as User, new Date());

      expect(notifications.sendEmail).toHaveBeenCalledWith(
        'u1',
        'account-locked',
        expect.objectContaining({ name: 'Ada' }),
      );
    });

    it('does not let a mail outage turn a lockout into a 500', async () => {
      const { service, notifications } = makeService();
      notifications.sendEmail.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.notifyLocked({ id: 'u1', email: 'a@b.c' } as User, new Date()),
      ).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('resets both the column counters and the advisory 2FA counter', async () => {
      const { service, client } = makeService();
      service.setRedisClient(client as never);

      await service.clear('u1');

      expect(client.del).toHaveBeenCalledWith('2fa:failures:u1');
    });

    it('zeroes the counter and removes the lock on the user row', async () => {
      const { service, update } = makeService();

      await service.clear('u1');

      expect(update).toHaveBeenCalledWith('u1', { failedLoginAttempts: 0, lockedUntil: null });
    });

    it('records an ACCOUNT_UNLOCKED event with the cause when a real lock is cleared', async () => {
      const { service, authEvents } = makeService();

      await service.clear('u1', {
        cause: 'password_reset',
        hadLock: true,
        userEmail: 'a@b.c',
        ipAddress: '10.0.0.1',
      });

      expect(authEvents.record).toHaveBeenCalledTimes(1);
      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_UNLOCKED',
          outcome: 'SUCCESS',
          userId: 'u1',
          userEmail: 'a@b.c',
          ipAddress: '10.0.0.1',
          metadata: { cause: 'password_reset' },
        }),
      );
    });

    it('records the cause as a successful login when none is given', async () => {
      const { service, authEvents } = makeService();

      await service.clear('u1', { hadLock: true });

      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { cause: 'successful_login' } }),
      );
    });

    it('does not record an unlock when only a partial failure count is cleared', async () => {
      const { service, authEvents } = makeService();

      // Three failed attempts and then a good login: nothing was ever locked,
      // so there is no unlock to put in the audit trail.
      await service.clear('u1', { cause: 'successful_login', hadLock: false });
      await service.clear('u1');

      expect(authEvents.record).not.toHaveBeenCalled();
    });
  });

  describe('lock audit events', () => {
    it('records ACCOUNT_LOCKED once, on the attempt that trips the lock', async () => {
      const lockedUntil = new Date(Date.now() + 900_000);
      const { service, authEvents } = makeService({ attempts: 5, lockedUntil });

      await service.recordPasswordFailure('u1', { userEmail: 'a@b.c', ipAddress: '10.0.0.1' });

      expect(authEvents.record).toHaveBeenCalledTimes(1);
      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_LOCKED',
          outcome: 'SUCCESS',
          userId: 'u1',
          userEmail: 'a@b.c',
          ipAddress: '10.0.0.1',
          metadata: expect.objectContaining({
            cause: 'max_failed_attempts',
            attempts: 5,
            threshold: 5,
            lockedUntil: lockedUntil.toISOString(),
            durationMs: 900_000,
          }),
        }),
      );
    });

    it('records nothing for an attempt that stays under the threshold', async () => {
      const { service, authEvents } = makeService({ attempts: 2, lockedUntil: null });

      await service.recordPasswordFailure('u1');

      expect(authEvents.record).not.toHaveBeenCalled();
    });
  });

  describe('releaseExpired', () => {
    it('only matches a lock whose time has passed, and resets the counter with it', async () => {
      const { service, update } = makeService();

      await service.releaseExpired('u1');

      const [where, patch] = update.mock.calls[0];
      expect(where.id).toBe('u1');
      // A TypeORM FindOperator, not a bare value: the update must be guarded so
      // it cannot clear a lock that is still in force.
      expect(where.lockedUntil).toBeDefined();
      expect(where.lockedUntil).not.toBeInstanceOf(Date);
      expect(patch).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
    });

    it('records an ACCOUNT_UNLOCKED event with cause "expired" when it released the lock', async () => {
      const { service, authEvents } = makeService();

      await expect(service.releaseExpired('u1', { userEmail: 'a@b.c' })).resolves.toBe(true);

      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_UNLOCKED',
          userId: 'u1',
          userEmail: 'a@b.c',
          metadata: { cause: 'expired' },
        }),
      );
    });

    it('records nothing when another request already released the lock', async () => {
      const { service, update, authEvents } = makeService();
      update.mockResolvedValue({ affected: 0 });

      // A login attempt and the sweep race for the same lock: only the one that
      // actually changed the row may write the audit event.
      await expect(service.releaseExpired('u1')).resolves.toBe(false);

      expect(authEvents.record).not.toHaveBeenCalled();
    });
  });

  describe('releaseExpiredLocks (scheduled sweep)', () => {
    it('releases and audits every expired lock it finds', async () => {
      const { service, find, authEvents } = makeService();
      find.mockResolvedValue([
        { id: 'u1', email: 'a@b.c' },
        { id: 'u2', email: 'd@e.f' },
      ]);

      await expect(service.releaseExpiredLocks()).resolves.toBe(2);

      expect(authEvents.record).toHaveBeenCalledTimes(2);
      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u2', userEmail: 'd@e.f', metadata: { cause: 'expired' } }),
      );
    });

    it('does nothing when no lock has expired', async () => {
      const { service, authEvents } = makeService();

      await expect(service.releaseExpiredLocks()).resolves.toBe(0);

      expect(authEvents.record).not.toHaveBeenCalled();
    });

    it('keeps going when one row fails to release', async () => {
      const { service, find, update, authEvents } = makeService();
      find.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      update.mockRejectedValueOnce(new Error('deadlock')).mockResolvedValueOnce({ affected: 1 });

      await expect(service.releaseExpiredLocks()).resolves.toBe(1);

      expect(authEvents.record).toHaveBeenCalledTimes(1);
      expect(authEvents.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2' }));
    });

    it('does not throw when the lookup itself fails, so the schedule keeps running', async () => {
      const { service, find } = makeService();
      find.mockRejectedValue(new Error('db down'));

      await expect(service.releaseExpiredLocks()).resolves.toBe(0);
    });

    it('limits how many rows one run handles', async () => {
      const { service, find } = makeService();

      await service.releaseExpiredLocks(25);

      expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
    });
  });

  describe('configuration', () => {
    const KEYS = ['MAX_FAILED_LOGIN_ATTEMPTS', 'ACCOUNT_LOCKOUT_DURATION_MS'] as const;
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => KEYS.forEach((k) => (saved[k] = process.env[k])));
    afterEach(() =>
      KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))),
    );

    it('uses the threshold and duration from the environment', async () => {
      process.env.MAX_FAILED_LOGIN_ATTEMPTS = '3';
      process.env.ACCOUNT_LOCKOUT_DURATION_MS = '60000';
      const lockedUntil = new Date(Date.now() + 60_000);
      const { service, set, authEvents } = makeService({ attempts: 3, lockedUntil });

      await service.recordPasswordFailure('u1');

      expect(set.mock.calls[0][0].lockedUntil()).toContain('>= 3');
      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ threshold: 3, durationMs: 60_000 }),
        }),
      );
    });

    it('falls back to 5 attempts and 15 minutes for missing or invalid values', async () => {
      process.env.MAX_FAILED_LOGIN_ATTEMPTS = 'not-a-number';
      delete process.env.ACCOUNT_LOCKOUT_DURATION_MS;
      const { service, set, authEvents } = makeService({
        attempts: 5,
        lockedUntil: new Date(Date.now() + 900_000),
      });

      await service.recordPasswordFailure('u1');

      expect(set.mock.calls[0][0].lockedUntil()).toContain('>= 5');
      expect(authEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ threshold: 5, durationMs: 900_000 }),
        }),
      );
    });
  });

  describe('IP throttle', () => {
    it('reports no excess for a quiet address', async () => {
      const { service } = makeService();

      await expect(service.ipFailuresExceedThreshold('1.2.3.4')).resolves.toBe(false);
    });

    it('fails open when Redis is down, so a shared NAT is not punished', async () => {
      const { service, client } = makeService();
      client.get = jest.fn().mockRejectedValue(new Error('down'));

      await expect(service.ipFailuresExceedThreshold('1.2.3.4')).resolves.toBe(false);
    });
  });
});
