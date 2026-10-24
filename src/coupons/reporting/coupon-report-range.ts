import { BadRequestException } from '@nestjs/common';
import { COUPON_REPORT } from './coupon-report.constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, name: string): number {
  if (!DATE_RE.test(value)) {
    throw new BadRequestException(`${name} must be a date in YYYY-MM-DD format`);
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Rejects impossible dates such as 2026-02-30 (they would silently roll over).
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${name} is not a valid date`);
  }
  return ms;
}

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Resolves the report window. Dates are UTC and inclusive: [from 00:00, to+1 day 00:00).
 * Defaults to the last DEFAULT_RANGE_DAYS days ending today. Rejects unbounded or huge ranges.
 */
export function resolveRange(from: string | undefined, to: string | undefined, now: Date = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const toMs = to ? parseDate(to, 'to') : today;
  const fromMs = from ? parseDate(from, 'from') : toMs - (COUPON_REPORT.DEFAULT_RANGE_DAYS - 1) * DAY_MS;

  if (fromMs > toMs) {
    throw new BadRequestException('from must not be after to');
  }
  const days = (toMs - fromMs) / DAY_MS + 1;
  if (days > COUPON_REPORT.MAX_RANGE_DAYS) {
    throw new BadRequestException(`Date range must not exceed ${COUPON_REPORT.MAX_RANGE_DAYS} days`);
  }
  return {
    start: new Date(fromMs),
    end: new Date(toMs + DAY_MS),
    from: fmt(fromMs),
    to: fmt(toMs),
  };
}