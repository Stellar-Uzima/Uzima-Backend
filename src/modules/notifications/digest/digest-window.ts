import { DigestFrequency } from './digest.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic window [start, end) in UTC.
 * daily: the previous full UTC day. weekly: the previous full Monday-Sunday week.
 * The same `now` day always gives the same window, which is what makes runs idempotent.
 */
export function digestWindow(frequency: DigestFrequency, now: Date = new Date()) {
  let end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (frequency === 'weekly') {
    const sinceMonday = (new Date(end).getUTCDay() + 6) % 7; // Monday = 0
    end -= sinceMonday * DAY_MS;
  }
  const length = frequency === 'weekly' ? 7 * DAY_MS : DAY_MS;
  return { start: new Date(end - length), end: new Date(end) };
}
