// Profile update allowlist and phone normalization. Closes #1481, #1482.
const EDITABLE_FIELDS = ['firstName', 'lastName', 'phone', 'dateOfBirth', 'gender', 'address'];

// Returns the permitted update, plus the list of rejected protected fields.
function pickProfileUpdate(body = {}) {
  const update = {};
  const rejected = [];
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_FIELDS.includes(key)) update[key] = value;
    else rejected.push(key);
  }
  return { update, rejected };
}

// Express middleware: protected fields (role, email, password...) are rejected.
const profileUpdateGuard = (req, res, next) => {
  const { update, rejected } = pickProfileUpdate(req.body);
  if (rejected.length) {
    return res.status(400).json({ success: false, message: `Cannot modify: ${rejected.join(', ')}` });
  }
  req.profileUpdate = update;
  return next();
};

// Normalizes to E.164 (+<country><number>); returns null when invalid.
function normalizePhone(input, defaultCountryCode = '234') {
  if (!input) return null;
  let digits = String(input).replace(/[\s\-().]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('0')) digits = `+${defaultCountryCode}${digits.slice(1)}`;
  if (!digits.startsWith('+')) digits = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

module.exports = { EDITABLE_FIELDS, pickProfileUpdate, profileUpdateGuard, normalizePhone };
