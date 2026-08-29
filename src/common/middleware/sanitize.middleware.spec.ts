import { Request, Response, NextFunction } from 'express';
import { SanitizeMiddleware } from './sanitize.middleware';

describe('SanitizeMiddleware', () => {
  let middleware: SanitizeMiddleware;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new SanitizeMiddleware();
    next = jest.fn();
  });

  function run(req: Partial<Request>): Partial<Request> {
    middleware.use(req as Request, {} as Response, next);
    return req;
  }

  it('trims whitespace and strips null bytes from string fields', () => {
    const req = run({ body: { name: '  Alice\0  ' } });
    expect(req.body.name).toBe('Alice');
  });

  it('escapes HTML/XSS payloads in string fields', () => {
    const req = run({ body: { comment: '<script>alert(1)</script>' } });
    expect(req.body.comment).not.toContain('<script>');
  });

  it('recursively sanitizes nested objects', () => {
    const req = run({
      body: { user: { profile: { bio: '  hello\0world  ' } } },
    });
    expect(req.body.user.profile.bio).toBe('helloworld');
  });

  it('recursively sanitizes arrays, including arrays of objects', () => {
    const req = run({
      body: { tags: ['  a  ', '<img onerror=1>', { label: '  b\0 ' }] },
    });
    expect(req.body.tags[0]).toBe('a');
    expect(req.body.tags[1]).not.toContain('onerror');
    expect(req.body.tags[2].label).toBe('b');
  });

  it('leaves numbers, booleans, null, and undefined untouched', () => {
    const req = run({
      body: { age: 30, active: true, deleted: null, note: undefined },
    });
    expect(req.body.age).toBe(30);
    expect(req.body.active).toBe(true);
    expect(req.body.deleted).toBeNull();
    expect(req.body.note).toBeUndefined();
  });

  it('sanitizes req.query the same way as req.body', () => {
    const req = run({ query: { q: '  search term\0  ' } });
    expect(req.query!.q).toBe('search term');
  });

  it('does nothing and still calls next() when body/query are absent', () => {
    const req: Partial<Request> = {};
    middleware.use(req as Request, {} as Response, next);
    expect(req.body).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('always calls next() exactly once', () => {
    run({ body: { a: '1' }, query: { b: '2' } });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
