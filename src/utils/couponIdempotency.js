// Idempotent coupon redemption and usage reporting. Closes #1548, #1549.

// `store` is a Map keyed by redemption reference (swap for a DB unique index in production).
function redeemOnce(store, { reference, userId, couponCode }, apply) {
  if (!reference) throw new Error('reference is required');
  if (store.has(reference)) return { ...store.get(reference), duplicate: true };
  const result = { userId, couponCode, benefit: apply(), redeemedAt: new Date().toISOString() };
  store.set(reference, result);
  return { ...result, duplicate: false };
}

// Aggregates only counts per coupon, with a bounded date range and no personal data.
function usageReport(redemptions, { from, to, maxRangeDays = 366 } = {}) {
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if (start && end && (end - start) / 86400000 > maxRangeDays) throw new Error('Date range too large');
  const totals = {};
  for (const r of redemptions) {
    const at = new Date(r.redeemedAt);
    if ((start && at < start) || (end && at > end)) continue;
    totals[r.couponCode] = (totals[r.couponCode] || 0) + 1;
  }
  return { totalRedemptions: Object.values(totals).reduce((a, b) => a + b, 0), byCoupon: totals };
}

module.exports = { redeemOnce, usageReport };
