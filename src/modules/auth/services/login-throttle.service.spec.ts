import { HttpStatus } from '@nestjs/common';
import { LoginThrottleService } from './login-throttle.service';
import { LoginThrottledException } from '../exceptions/login-throttled.exception';

/** Minimal in-memory stand-in for the Redis commands the service uses. */
function makeFakeRedis() {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();

  return {
    counts,
    ttls,
    get: jest.fn(async (key: string) => (counts.has(key) ? String(counts.get(key)) : null)),
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    }),
    ttl: jest.fn(async (key: string) => (ttls.has(key) ? (ttls.get(key) as number) : -1)),
    del: jest.fn(async (key: string) => {
      counts.delete(key);
      ttls.delete(key);
      return 1;
    }),
  };
}

function makeService(env: Record<string, string> = {}) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  const service = new LoginThrottleService();
  const redis = makeFakeRedis();
  service.setRedisClient(redis as never);

  for (const key of Object.keys(env)) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }

  return { service, redis };
}

async function fail(
  service: LoginThrottleService,
  identity: string,
  ip: string | undefined,
  times: number
) {
  for (let i = 0; i < times; i++) {
    await service.recordFailure(identity, ip);
  }
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('LoginThrottleService (#1469)', () => {
  describe('limits', () => {
    it('allows attempts while both counters are under their limits', async () => {
      const { service } = makeService();

      await fail(service, 'a@example.com', '10.0.0.1', 4);

      await expect(service.assertAllowed('a@example.com', '10.0.0.1')).resolves.toBeUndefined();
    });

    it('blocks an identity once it reaches the identity limit', async () => {
      const { service } = makeService();

      await fail(service, 'a@example.com', '10.0.0.1', 5);

      await expect(service.assertAllowed('a@example.com', '10.0.0.1')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });

    it('does not block a different identity from the same, still-under-limit client', async () => {
      const { service } = makeService();

      await fail(service, 'a@example.com', '10.0.0.1', 5);

      await expect(service.assertAllowed('b@example.com', '10.0.0.1')).resolves.toBeUndefined();
    });

    it('blocks a client that spreads failures across many identities', async () => {
      const { service } = makeService();

      // One guess per address: no identity counter ever fills up.
      for (let i = 0; i < 20; i++) {
        await service.recordFailure(`user${i}@example.com`, '10.0.0.9');
      }

      await expect(service.assertAllowed('fresh@example.com', '10.0.0.9')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });

    it('applies the identity limit when no client IP is available', async () => {
      const { service } = makeService();

      await fail(service, 'a@example.com', undefined, 5);

      await expect(service.assertAllowed('a@example.com')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });
  });

  describe('retry indication', () => {
    it('reports the remaining window of the counter that is over its limit', async () => {
      const { service, redis } = makeService();
      await fail(service, 'a@example.com', '10.0.0.1', 5);

      const identityKey = [...redis.counts.keys()].find((k) =>
        k.startsWith('login:throttle:id:')
      ) as string;
      redis.ttls.set(identityKey, 321);

      const error = (await caught(
        service.assertAllowed('a@example.com', '10.0.0.1')
      )) as LoginThrottledException;

      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.retryAfterSeconds).toBe(321);
      expect((error.getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBe(321);
    });

    it('reports the longer wait when both counters are over their limits', async () => {
      const { service, redis } = makeService();
      await fail(service, 'a@example.com', '10.0.0.1', 5);
      for (let i = 0; i < 20; i++) {
        await service.recordFailure(`u${i}@example.com`, '10.0.0.1');
      }

      for (const key of redis.counts.keys()) {
        if (key.startsWith('login:throttle:ip:')) redis.ttls.set(key, 700);
        else redis.ttls.set(key, 100);
      }

      const error = (await caught(
        service.assertAllowed('a@example.com', '10.0.0.1')
      )) as LoginThrottledException;

      expect(error.retryAfterSeconds).toBe(700);
    });

    it('never tells the caller to retry in less than one second', () => {
      expect(new LoginThrottledException(0).retryAfterSeconds).toBe(1);
      expect(new LoginThrottledException(0.2).retryAfterSeconds).toBe(1);
    });
  });

  describe('does not reveal whether an account exists', () => {
    it('produces an identical response for any identity that has hit the limit', async () => {
      const { service, redis } = makeService();

      // The service never sees a user record, so "registered" and
      // "unregistered" are only ever different strings. Same failures, same TTL.
      await fail(service, 'registered@example.com', undefined, 5);
      await fail(service, 'nobody@example.com', undefined, 5);
      for (const key of redis.counts.keys()) redis.ttls.set(key, 600);

      const known = (await caught(
        service.assertAllowed('registered@example.com')
      )) as LoginThrottledException;
      const unknown = (await caught(
        service.assertAllowed('nobody@example.com')
      )) as LoginThrottledException;

      expect(known.getStatus()).toBe(unknown.getStatus());
      expect(known.getResponse()).toEqual(unknown.getResponse());
    });

    it('keeps the identity out of the response body', async () => {
      const { service } = makeService();
      await fail(service, 'secret.person@example.com', undefined, 5);

      const error = (await caught(
        service.assertAllowed('secret.person@example.com')
      )) as LoginThrottledException;

      expect(JSON.stringify(error.getResponse())).not.toContain('secret.person');
    });

    it('counts failures for unregistered addresses exactly like registered ones', async () => {
      const { service } = makeService();

      await service.recordFailure('nobody@example.com', '10.0.0.1');

      await fail(service, 'nobody@example.com', '10.0.0.1', 4);
      await expect(service.assertAllowed('nobody@example.com', '10.0.0.1')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });
  });

  describe('storage', () => {
    it('sets the window expiry when a counter is created, and only then', async () => {
      const { service, redis } = makeService();

      await service.recordFailure('a@example.com', '10.0.0.1');
      await service.recordFailure('a@example.com', '10.0.0.1');

      // Two counters created once each; the second failure must not extend them.
      expect(redis.expire).toHaveBeenCalledTimes(2);
      for (const seconds of redis.ttls.values()) expect(seconds).toBe(900);
    });

    it('stores a hash of the identity, never the address itself', async () => {
      const { service, redis } = makeService();

      await service.recordFailure('a@example.com', '10.0.0.1');

      const identityKey = [...redis.counts.keys()].find((k) =>
        k.startsWith('login:throttle:id:')
      ) as string;
      expect(identityKey).toMatch(/^login:throttle:id:[0-9a-f]{64}$/);
      expect(identityKey).not.toContain('example.com');
    });

    it('treats case and surrounding whitespace in the address as the same identity', async () => {
      const { service } = makeService();

      await service.recordFailure('A@Example.com', undefined);
      await service.recordFailure('  a@example.com ', undefined);
      await fail(service, 'a@example.com', undefined, 3);

      await expect(service.assertAllowed('a@example.com')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });

    it('gives a counter that lost its expiry a new one so it cannot throttle forever', async () => {
      const { service, redis } = makeService();
      await fail(service, 'a@example.com', undefined, 5);
      redis.ttls.clear(); // simulates a crash between INCR and EXPIRE
      redis.expire.mockClear();

      const error = (await caught(
        service.assertAllowed('a@example.com')
      )) as LoginThrottledException;

      expect(error).toBeInstanceOf(LoginThrottledException);
      expect(error.retryAfterSeconds).toBe(900);
      expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('login:throttle:id:'), 900);
    });
  });

  describe('clearIdentity', () => {
    it('resets the identity counter after a successful login', async () => {
      const { service } = makeService();
      await fail(service, 'a@example.com', '10.0.0.1', 4);

      await service.clearIdentity('a@example.com');
      await service.recordFailure('a@example.com', '10.0.0.1');

      await expect(service.assertAllowed('a@example.com', '10.0.0.1')).resolves.toBeUndefined();
    });

    it('leaves the client counter alone so a valid account cannot reset an attacker budget', async () => {
      const { service, redis } = makeService();
      await fail(service, 'a@example.com', '10.0.0.1', 4);

      await service.clearIdentity('a@example.com');

      const remaining = [...redis.counts.keys()];
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toBe('login:throttle:ip:10.0.0.1');
    });
  });

  describe('configuration', () => {
    it('reads the limits and window from the environment', async () => {
      const { service, redis } = makeService({
        LOGIN_THROTTLE_IDENTITY_MAX_ATTEMPTS: '2',
        LOGIN_THROTTLE_CLIENT_MAX_ATTEMPTS: '3',
        LOGIN_THROTTLE_WINDOW_SECONDS: '60',
      });

      await fail(service, 'a@example.com', '10.0.0.1', 2);
      await expect(service.assertAllowed('a@example.com', '10.0.0.1')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
      for (const seconds of redis.ttls.values()) expect(seconds).toBe(60);

      await service.recordFailure('b@example.com', '10.0.0.1');
      await expect(service.assertAllowed('c@example.com', '10.0.0.1')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });

    it('falls back to the defaults for missing, zero or non-numeric values', async () => {
      const { service } = makeService({
        LOGIN_THROTTLE_IDENTITY_MAX_ATTEMPTS: '0',
        LOGIN_THROTTLE_CLIENT_MAX_ATTEMPTS: 'abc',
        LOGIN_THROTTLE_WINDOW_SECONDS: '-5',
      });

      await fail(service, 'a@example.com', undefined, 4);
      await expect(service.assertAllowed('a@example.com')).resolves.toBeUndefined();

      await fail(service, 'a@example.com', undefined, 1);
      await expect(service.assertAllowed('a@example.com')).rejects.toBeInstanceOf(
        LoginThrottledException
      );
    });
  });

  describe('when Redis is unavailable', () => {
    function brokenService() {
      const service = new LoginThrottleService();
      const boom = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      service.setRedisClient({
        get: boom,
        incr: boom,
        expire: boom,
        ttl: boom,
        del: boom,
      } as never);
      return service;
    }

    it('fails open on every operation instead of blocking logins', async () => {
      const service = brokenService();

      await expect(service.assertAllowed('a@example.com', '10.0.0.1')).resolves.toBeUndefined();
      await expect(service.recordFailure('a@example.com', '10.0.0.1')).resolves.toBeUndefined();
      await expect(service.clearIdentity('a@example.com')).resolves.toBeUndefined();
    });
  });
});
