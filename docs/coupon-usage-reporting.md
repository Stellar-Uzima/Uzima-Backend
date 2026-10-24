# Coupon usage reporting

`GET /coupons/reports/usage` (admin only; the final path depends on the global prefix and version, for example `/api/v1/coupons/reports/usage`).

## Query parameters
| Parameter | Default | Notes |
| --- | --- | --- |
| `from`, `to` | last 30 days ending today | UTC dates `YYYY-MM-DD`, both inclusive. `from` must not be after `to`; the range is limited to 366 days |
| `campaignId` | none | Restrict to one campaign |
| `limit`, `offset` | 25, 0 | Pagination for the per-coupon rows (`limit` max 100) |

## Response
- `totals`: redemptions, unique users and total discount in the window
- `byCoupon`: one row per coupon (`couponId`, `code`, `redemptions`, `uniqueUsers`, `totalDiscount`) with `limit`, `offset`, `hasMore`
- `byDay`: redemptions and unique users per UTC day

## Data rules
- All numbers are SQL aggregates over the persisted redemption records, read in one repeatable-read transaction so the sections agree.
- Only counts are returned. No user ids, emails or names are exposed.
- Invalid or oversized ranges return `400` before any query runs.