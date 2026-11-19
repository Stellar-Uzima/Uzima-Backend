// Quiet hours and digest scheduling. Closes #1566, #1567.
const URGENT_CATEGORIES = ['security', 'payment', 'emergency']; // Always delivered, even in quiet hours.

// Hour of day in the user's time zone (IANA name, e.g. "Africa/Lagos").
const localHour = (date, timeZone) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(date)) % 24;

// Handles intervals that cross midnight, e.g. 22 -> 7.
function isQuietHours(date, { timeZone = 'UTC', startHour = 22, endHour = 7 } = {}) {
  const h = localHour(date, timeZone);
  return startHour <= endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
}

const shouldDefer = (notification, prefs, now = new Date()) =>
  !URGENT_CATEGORIES.includes(notification.category) && isQuietHours(now, prefs);

// Stable key per user + frequency + period, so a retried digest job is a no-op.
function digestKey(userId, frequency, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const period = frequency === 'weekly' ? `${day.slice(0, 4)}-W${Math.ceil(now.getUTCDate() / 7)}` : day;
  return `digest:${userId}:${frequency}:${period}`;
}

function selectDigestItems(notifications, prefs) {
  return notifications.filter((n) => (prefs.categories || []).includes(n.category) && !n.digested);
}

module.exports = { URGENT_CATEGORIES, isQuietHours, shouldDefer, digestKey, selectDigestItems };
