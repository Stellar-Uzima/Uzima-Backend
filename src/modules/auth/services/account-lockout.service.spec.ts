import { Repository } from 'typeorm';
import { User } from '@/entities/user.entity';
import { AccountLockoutService } from './account-lockout.service';
import { AccountLockedException } from '../exceptions/account-locked.exception';

/** Captures the single UPDATE statement the service issues. */
function makeRepo(result: { attempts: number; lockedUntil: Date | null }) {
  const set = jest.fn();
  const where = jest.fn().mockReturnValue({
    returning: () => ({ execute: async () => ({ raw: [{ failedLoginAttempts: result.attempts, lockedUntil: result.lockedUntil }] }) }),
  });
  const qb = { set, where };

  return {
    repo: { createQueryBuilder: () => qb, update: jest.fn() } as unknown as Repository<User>,
    qb,
    set,
    where,
  };
}

function makeService(result: { attempts: number; lockedUntil: Date | null } = { attempts: 1, lockedUntil: null }) {
  const { repo, qb, set, where } = makeRepo(result);
  const notifications = { sendEmail: jest.fn().mockResolvedValue(undefined) };

  const service = new AccountLockoutService(repo, notifications as never);

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

  return { service, qb, set, where, notifications, client };
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
