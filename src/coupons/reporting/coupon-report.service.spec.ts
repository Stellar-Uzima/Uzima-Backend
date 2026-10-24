import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CouponReportService } from './coupon-report.service';

type Handler = (params: any[]) => any;

function fakeDataSource(handlers: Record<string, Handler>) {
  const calls: Array<{ marker: string; params: any[] }> = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    const marker = /\/\* (coupon-report:[\w-]+) \*\//.exec(sql)?.[1] ?? 'unknown';
    calls.push({ marker, params });
    return handlers[marker] ? handlers[marker](params) : [];
  });
  const transaction = jest.fn(async (_iso: string, fn: (m: any) => any) => fn({ query }));
  return { ds: { transaction, query } as unknown as DataSource, transaction, query, calls };
}

const NOW = new Date('2026-10-24T10:00:00Z');

describe('CouponReportService', () => {
  it('maps aggregates and exposes no personal data', async () => {
    const { ds } = fakeDataSource({
      'coupon-report:totals': () => [{ redemptions: 12, unique_users: 9, total_discount: '45.50' }],
      'coupon-report:by-coupon': () => [
        { coupon_id: 'c1', code: 'SAVE10', redemptions: 7, unique_users: 6, total_discount: '30.00' },
      ],
      'coupon-report:by-day': () => [{ day: '2026-10-20', redemptions: 12, unique_users: 9 }],
    });
    const report = await new CouponReportService(ds).usage({ from: '2026-10-01', to: '2026-10-24' }, NOW);

    expect(report.totals).toEqual({ redemptions: 12, uniqueUsers: 9, totalDiscount: '45.50' });
    expect(Object.keys(report.byCoupon.items[0]).sort()).toEqual(
      ['code', 'couponId', 'redemptions', 'totalDiscount', 'uniqueUsers'].sort(),
    );
    const json = JSON.stringify(report).toLowerCase();
    expect(json).not.toContain('email');
    expect(json).not.toContain('user_id');
    expect(json).not.toContain('"userid"');
  });

  it('passes the bounded window and campaign filter to every query', async () => {
    const { ds, calls } = fakeDataSource({});
    await new CouponReportService(ds).usage({ from: '2026-10-01', to: '2026-10-03', campaignId: 'camp-1' }, NOW);

    for (const marker of ['coupon-report:totals', 'coupon-report:by-coupon', 'coupon-report:by-day']) {
      const p = calls.find((c) => c.marker === marker)!.params;
      expect((p[0] as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect((p[1] as Date).toISOString()).toBe('2026-10-04T00:00:00.000Z');
      expect(p[2]).toBe('camp-1');
    }
  });

  it('runs all queries in one repeatable-read transaction', async () => {
    const { ds, transaction } = fakeDataSource({});
    await new CouponReportService(ds).usage({}, NOW);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith('REPEATABLE READ', expect.any(Function));
  });

  it('uses limit+1 to report hasMore and trims the extra row', async () => {
    const rows = [1, 2, 3].map((n) => ({
      coupon_id: `c${n}`, code: `C${n}`, redemptions: n, unique_users: n, total_discount: '0',
    }));
    const { ds } = fakeDataSource({ 'coupon-report:by-coupon': () => rows });
    const report = await new CouponReportService(ds).usage({ limit: 2 }, NOW);

    expect(report.byCoupon.items).toHaveLength(2);
    expect(report.byCoupon.hasMore).toBe(true);
    expect(report.byCoupon.limit).toBe(2);
  });

  it('clamps an oversized limit to the maximum', async () => {
    const { ds, calls } = fakeDataSource({});
    const report = await new CouponReportService(ds).usage({ limit: 500 }, NOW);

    expect(report.byCoupon.limit).toBe(100);
    expect(calls.find((c) => c.marker === 'coupon-report:by-coupon')!.params[3]).toBe(101);
  });

  it('returns zeros for an empty period', async () => {
    const { ds } = fakeDataSource({});
    const report = await new CouponReportService(ds).usage({}, NOW);

    expect(report.totals).toEqual({ redemptions: 0, uniqueUsers: 0, totalDiscount: '0' });
    expect(report.byCoupon.items).toEqual([]);
    expect(report.byDay).toEqual([]);
  });

  it('rejects an invalid range before touching the database', async () => {
    const { ds, query, transaction } = fakeDataSource({});
    await expect(
      new CouponReportService(ds).usage({ from: '2020-01-01', to: '2026-10-24' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});