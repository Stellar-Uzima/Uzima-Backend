import { BadRequestException } from '@nestjs/common';
import { resolveRange } from './coupon-report-range';

const NOW = new Date('2026-10-24T10:00:00Z');

describe('resolveRange', () => {
  it('defaults to the last 30 days ending today (UTC)', () => {
    const r = resolveRange(undefined, undefined, NOW);
    expect(r.from).toBe('2026-09-25');
    expect(r.to).toBe('2026-10-24');
    expect(r.end.toISOString()).toBe('2026-10-25T00:00:00.000Z'); // inclusive "to"
  });

  it('treats from and to as inclusive UTC days', () => {
    const r = resolveRange('2026-10-01', '2026-10-03', NOW);
    expect(r.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });

  it('accepts exactly 366 days', () => {
    expect(() => resolveRange('2025-10-24', '2026-10-24', NOW)).not.toThrow();
  });

  it('rejects a range longer than 366 days', () => {
    expect(() => resolveRange('2025-10-23', '2026-10-24', NOW)).toThrow(BadRequestException);
  });

  it('rejects from after to', () => {
    expect(() => resolveRange('2026-10-10', '2026-10-01', NOW)).toThrow(BadRequestException);
  });

  it('rejects badly formatted dates', () => {
    expect(() => resolveRange('10/01/2026', undefined, NOW)).toThrow(BadRequestException);
    expect(() => resolveRange(undefined, '2026-1-1', NOW)).toThrow(BadRequestException);
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(() => resolveRange('2026-02-30', '2026-03-05', NOW)).toThrow(BadRequestException);
  });
});