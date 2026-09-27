import { CursorCodec } from './cursor-codec';
import { BadRequestApiException } from '../errors/api-error.exception';

describe('CursorCodec (#1293)', () => {
  const codec = new CursorCodec('test-secret');
  const payload = { f: 'createdAt', d: 'DESC' as const, v: '2025-01-01T00:00:00.000Z', k: 'user-42' };

  it('round-trips a cursor', () => {
    expect(codec.decode(codec.encode(payload))).toEqual(payload);
  });

  it('produces an opaque, URL-safe token', () => {
    const cursor = codec.encode(payload);

    expect(cursor).not.toContain('{');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('rejects a cursor whose payload was edited by the client', () => {
    const [body] = codec.encode(payload).split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...payload, f: 'password' }),
      'utf8',
    ).toString('base64url');

    expect(() => codec.decode(`${tampered}.${codec.encode(payload).split('.')[1]}`)).toThrow(BadRequestApiException);
    expect(() => codec.decode(`${body}.${body}`)).toThrow(BadRequestApiException);
  });

  it('rejects a cursor signed with a different secret', () => {
    const foreign = new CursorCodec('other-secret').encode(payload);

    expect(() => codec.decode(foreign)).toThrow(BadRequestApiException);
  });

  it('rejects a structurally malformed cursor', () => {
    expect(() => codec.decode('no-separator')).toThrow(BadRequestApiException);
  });

  it('rejects a well-signed payload that is missing required fields', () => {
    const incomplete = new CursorCodec('test-secret').encode({ f: 'id' } as never);

    expect(() => codec.decode(incomplete)).toThrow(BadRequestApiException);
  });
});
