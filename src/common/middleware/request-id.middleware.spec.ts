import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware';
import { RequestContextService } from './request-context.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMocks(headers: Record<string, string> = {}) {
  const req = {
    headers,
    method: 'GET',
    path: '/api/test',
  } as unknown as Request;

  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;

  const next = jest.fn();

  return { req, res, next, setHeader };
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestContextService
// ─────────────────────────────────────────────────────────────────────────────

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestContextService],
    }).compile();
    service = module.get(RequestContextService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getContext() returns undefined outside a run() call', () => {
    expect(service.getContext()).toBeUndefined();
  });

  it('getRequestId() returns "no-request-id" outside a run() call', () => {
    expect(service.getRequestId()).toBe('no-request-id');
  });

  it('getUserId() returns undefined outside a run() call', () => {
    expect(service.getUserId()).toBeUndefined();
  });

  it('run() makes the context available inside the callback', (done) => {
    const ctx = { requestId: 'test-id-123', startTime: Date.now() };
    service.run(ctx, () => {
      expect(service.getRequestId()).toBe('test-id-123');
      done();
    });
  });

  it('getContext() returns the full context inside run()', (done) => {
    const ctx = { requestId: 'abc', method: 'POST', path: '/api/x', startTime: 1000 };
    service.run(ctx, () => {
      const stored = service.getContext();
      expect(stored?.requestId).toBe('abc');
      expect(stored?.method).toBe('POST');
      expect(stored?.path).toBe('/api/x');
      done();
    });
  });

  it('setUserId() updates userId on the active context', (done) => {
    service.run({ requestId: 'r1', startTime: Date.now() }, () => {
      service.setUserId('user-42');
      expect(service.getUserId()).toBe('user-42');
      done();
    });
  });

  it('setUserId() is a no-op outside a run() call', () => {
    expect(() => service.setUserId('ghost')).not.toThrow();
    expect(service.getUserId()).toBeUndefined();
  });

  it('contexts are isolated between concurrent run() calls', (done) => {
    let resolveA: () => void;
    let resolveB: () => void;

    const promiseA = new Promise<void>((r) => (resolveA = r));
    const promiseB = new Promise<void>((r) => (resolveB = r));

    service.run({ requestId: 'id-A', startTime: Date.now() }, () => {
      // Inside context A
      expect(service.getRequestId()).toBe('id-A');
      resolveA!();
    });

    service.run({ requestId: 'id-B', startTime: Date.now() }, () => {
      // Inside context B — must not see A's id
      expect(service.getRequestId()).toBe('id-B');
      resolveB!();
    });

    Promise.all([promiseA, promiseB]).then(() => done());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RequestIdMiddleware
// ─────────────────────────────────────────────────────────────────────────────

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let contextService: RequestContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestIdMiddleware, RequestContextService],
    }).compile();

    middleware = module.get(RequestIdMiddleware);
    contextService = module.get(RequestContextService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  // ── X-Request-ID header generation ─────────────────────────────────────────

  it('generates a UUID request ID when no X-Request-ID header is present', (done) => {
    const { req, res, next, setHeader } = makeMocks();

    middleware.use(req, res, () => {
      // UUID v4 pattern
      expect(setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      );
      done();
    });
  });

  it('honours an existing X-Request-ID header from the client', (done) => {
    const { req, res, setHeader } = makeMocks({ 'x-request-id': 'gateway-id-xyz' });

    middleware.use(req, res, () => {
      expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'gateway-id-xyz');
      done();
    });
  });

  it('attaches the request ID to req.requestId', (done) => {
    const { req, res } = makeMocks({ 'x-request-id': 'my-id' });

    middleware.use(req, res, () => {
      expect((req as any).requestId).toBe('my-id');
      done();
    });
  });

  it('sets X-Request-ID response header', (done) => {
    const { req, res, setHeader } = makeMocks();

    middleware.use(req, res, () => {
      expect(setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
      done();
    });
  });

  it('calls next()', (done) => {
    const { req, res } = makeMocks();
    const next = jest.fn(() => done());
    middleware.use(req, res, next);
  });

  // ── AsyncLocalStorage context ───────────────────────────────────────────────

  it('populates requestId in the AsyncLocalStorage context during next()', (done) => {
    const { req, res } = makeMocks({ 'x-request-id': 'ctx-id-001' });

    middleware.use(req, res, () => {
      expect(contextService.getRequestId()).toBe('ctx-id-001');
      done();
    });
  });

  it('populates method and path in the context', (done) => {
    const { req, res } = makeMocks();

    middleware.use(req, res, () => {
      const ctx = contextService.getContext();
      expect(ctx?.method).toBe('GET');
      expect(ctx?.path).toBe('/api/test');
      done();
    });
  });

  it('sets startTime in the context', (done) => {
    const before = Date.now();
    const { req, res } = makeMocks();

    middleware.use(req, res, () => {
      const ctx = contextService.getContext();
      expect(ctx?.startTime).toBeGreaterThanOrEqual(before);
      expect(ctx?.startTime).toBeLessThanOrEqual(Date.now());
      done();
    });
  });

  it('each request gets its own isolated context', (done) => {
    const ids: string[] = [];
    let completed = 0;

    const check = () => {
      completed++;
      if (completed === 2) {
        expect(ids[0]).not.toBe(ids[1]);
        done();
      }
    };

    const { req: req1, res: res1 } = makeMocks();
    const { req: req2, res: res2 } = makeMocks();

    middleware.use(req1, res1, () => {
      ids[0] = contextService.getRequestId();
      check();
    });

    middleware.use(req2, res2, () => {
      ids[1] = contextService.getRequestId();
      check();
    });
  });

  // ── User ID propagation ─────────────────────────────────────────────────────

  it('userId is undefined in the context before setUserId is called', (done) => {
    const { req, res } = makeMocks();

    middleware.use(req, res, () => {
      expect(contextService.getUserId()).toBeUndefined();
      done();
    });
  });

  it('setUserId() updates the context inside a live request', (done) => {
    const { req, res } = makeMocks();

    middleware.use(req, res, () => {
      contextService.setUserId('user-99');
      expect(contextService.getUserId()).toBe('user-99');
      done();
    });
  });

  // ── Generated IDs are unique ────────────────────────────────────────────────

  it('generates a different request ID for each request', (done) => {
    const collectedIds: string[] = [];
    let count = 0;

    const collect = () => {
      collectedIds.push(contextService.getRequestId());
      count++;
      if (count === 5) {
        const unique = new Set(collectedIds);
        expect(unique.size).toBe(5);
        done();
      }
    };

    for (let i = 0; i < 5; i++) {
      const { req, res } = makeMocks();
      middleware.use(req, res, collect);
    }
  });
});