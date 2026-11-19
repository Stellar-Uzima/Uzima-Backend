// Reward expiration, referral codes and referral reward settlement. Closes #1541, #1542, #1544.
const crypto = require('crypto');

// Expiry is compared in UTC; a date-only value expires at the end of that UTC day.
function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (typeof expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) d.setUTCHours(23, 59, 59, 999);
  return now > d;
}

const canRedeem = (reward, now = new Date()) => !reward.redeemed && !isExpired(reward.expiresAt, now);

// Random (non-sequential) code from an unambiguous alphabet.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateReferralCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Reward only after the qualification event, and once per reward type.
function canSettleReferral(referral, rule = { event: 'first_deposit', rewardType: 'points' }) {
  if (!referral || !(referral.completedEvents || []).includes(rule.event)) return false;
  return !(referral.rewards || []).some((r) => r.type === rule.rewardType);
}

module.exports = { isExpired, canRedeem, generateReferralCode, canSettleReferral };
