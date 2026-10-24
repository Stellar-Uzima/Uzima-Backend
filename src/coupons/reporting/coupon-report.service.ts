import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { COUPON_REPORT as C, CouponUsageReport } from './coupon-report.constants';
import { CouponReportQueryDto } from './coupon-report-query.dto';
import { resolveRange } from './coupon-report-range';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

@Injectable()
export class CouponReportService {
  constructor(private readonly dataSource: DataSource) {}

  async usage(query: CouponReportQueryDto, now: Date = new Date()): Promise<CouponUsageReport> {
    const range = resolveRange(query.from, query.to, now); // throws 400 before any query runs
    const limit = clamp(Number(query.limit ?? C.DEFAULT_LIMIT) || C.DEFAULT_LIMIT, 1, C.MAX_LIMIT);
    const offset = clamp(Number(query.offset ?? 0) || 0, 0, C.MAX_OFFSET);
    const campaignId = query.campaignId ?? null;

    const discountSum = C.redDiscount ? `COALESCE(SUM(r.${C.redDiscount}), 0)::text` : `'0'`;
    const filter = `
      FROM ${C.redemptionsTable} r
      JOIN ${C.couponsTable} c ON c.${C.couponId} = r.${C.redCouponId}
      WHERE r.${C.redCreatedAt} >= $1 AND r.${C.redCreatedAt} < $2
        AND ($3::text IS NULL OR c.${C.couponCampaignId}::text = $3)`;
    const base = [range.start, range.end, campaignId];

    // One repeatable-read snapshot so totals, per-coupon and per-day rows agree with each other.
    const [totals, coupons, days] = await this.dataSource.transaction('REPEATABLE READ', async (m) => {
      const t = await m.query(
        `/* coupon-report:totals */
         SELECT COUNT(r.${C.redId})::int AS redemptions,
                COUNT(DISTINCT r.${C.redUserId})::int AS unique_users,
                ${discountSum} AS total_discount
         ${filter}`,
        base,
      );
      const c = await m.query(
        `/* coupon-report:by-coupon */
         SELECT c.${C.couponId}::text AS coupon_id, c.${C.couponCode} AS code,
                COUNT(r.${C.redId})::int AS redemptions,
                COUNT(DISTINCT r.${C.redUserId})::int AS unique_users,
                ${discountSum} AS total_discount
         ${filter}
         GROUP BY c.${C.couponId}, c.${C.couponCode}
         ORDER BY redemptions DESC, c.${C.couponCode} ASC
         LIMIT $4 OFFSET $5`,
        [...base, limit + 1, offset], // one extra row tells us whether another page exists
      );
      const d = await m.query(
        `/* coupon-report:by-day */
         SELECT to_char(date_trunc('day', r.${C.redCreatedAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                COUNT(r.${C.redId})::int AS redemptions,
                COUNT(DISTINCT r.${C.redUserId})::int AS unique_users
         ${filter}
         GROUP BY 1 ORDER BY 1`,
        base,
      );
      return [t, c, d] as const;
    });

    const t = totals[0] ?? {};
    return {
      range: { from: range.from, to: range.to },
      filters: { campaignId },
      totals: {
        redemptions: Number(t.redemptions ?? 0),
        uniqueUsers: Number(t.unique_users ?? 0),
        totalDiscount: String(t.total_discount ?? '0'),
      },
      byCoupon: {
        items: coupons.slice(0, limit).map((r: any) => ({
          couponId: String(r.coupon_id),
          code: String(r.code),
          redemptions: Number(r.redemptions),
          uniqueUsers: Number(r.unique_users),
          totalDiscount: String(r.total_discount),
        })),
        limit,
        offset,
        hasMore: coupons.length > limit,
      },
      byDay: days.map((r: any) => ({
        day: String(r.day),
        redemptions: Number(r.redemptions),
        uniqueUsers: Number(r.unique_users),
      })),
    };
  }
}