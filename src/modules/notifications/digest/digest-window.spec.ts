import { digestWindow } from './digest-window';

describe('digestWindow', () => {
  it('daily is the previous full UTC day', () => {
    const w = digestWindow('daily', new Date('2026-10-24T09:30:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-23T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-24T00:00:00.000Z');
  });

  it('weekly is the previous Monday-Sunday week', () => {
    // 2026-10-24 is a Saturday; current week started Monday 2026-10-19
    const w = digestWindow('weekly', new Date('2026-10-24T09:30:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('is stable for any time on the same day', () => {
    const a = digestWindow('daily', new Date('2026-10-24T00:00:01Z'));
    const b = digestWindow('daily', new Date('2026-10-24T23:59:59Z'));
    expect(a).toEqual(b);
  });
});
