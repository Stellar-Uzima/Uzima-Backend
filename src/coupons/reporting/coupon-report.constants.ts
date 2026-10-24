export const COUPON_REPORT = {
  MAX_RANGE_DAYS: 366,
  DEFAULT_RANGE_DAYS: 30,
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
  MAX_OFFSET: 100000,
  // REPLACE the values below with the real names from the redemption/coupon entities
  // (trusted constants, never user input).
  redemptionsTable: 'coupon_redemptions',
  redId: 'id',
  redCouponId: 'coupon_id',
  redUserId: 'user_id',
  redCreatedAt: 'created_at',
  redDiscount: 'discount_amount' as string | null, // set to null if redemptions store no amount
  couponsTable: 'coupons',
  couponId: 'id',
  couponCode: 'code',
  couponCampaignId: 'campaign_id',
};

export interface CouponUsageReport {
  range: { from: string; to: string };
  filters: { campaignId: string | null };
  totals: { redemptions: number; uniqueUsers: number; totalDiscount: string };
  byCoupon: {
    items: Array<{
      couponId: string;
      code: string;
      redemptions: number;
      uniqueUsers: number;
      totalDiscount: string;
    }>;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  byDay: Array<{ day: string; redemptions: number; uniqueUsers: number }>;
}