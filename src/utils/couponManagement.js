// Coupon creation validation and status lifecycle. Closes #1546.
const STATUSES = ['draft', 'active', 'paused', 'expired', 'cancelled'];
const TRANSITIONS = {
  draft: ['active', 'cancelled'],
  active: ['paused', 'expired', 'cancelled'],
  paused: ['active', 'cancelled'],
  expired: [],
  cancelled: [],
};

function validateCoupon({ code, value, maxRedemptions, startsAt, endsAt } = {}) {
  const errors = [];
  if (!/^[A-Z0-9_-]{4,20}$/.test(code || '')) errors.push('code must be 4-20 chars (A-Z, 0-9, _ -)');
  if (!(Number(value) > 0)) errors.push('value must be greater than 0');
  if (maxRedemptions !== undefined && !(Number.isInteger(maxRedemptions) && maxRedemptions > 0)) {
    errors.push('maxRedemptions must be a positive integer');
  }
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) errors.push('endsAt must be after startsAt');
  return { valid: errors.length === 0, errors };
}

// Returns an audit entry for a permitted change; throws on forbidden transitions.
function changeCouponStatus(coupon, nextStatus, actor) {
  if (!actor || !['admin', 'marketing'].includes(actor.role)) throw new Error('Not permitted');
  if (!STATUSES.includes(nextStatus) || !TRANSITIONS[coupon.status].includes(nextStatus)) {
    throw new Error(`Cannot move coupon from ${coupon.status} to ${nextStatus}`);
  }
  return { couponId: coupon.id, from: coupon.status, to: nextStatus, actorId: actor.id, at: new Date().toISOString() };
}

module.exports = { STATUSES, validateCoupon, changeCouponStatus };
