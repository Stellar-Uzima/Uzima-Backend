// Central role/permission checks and safe auth audit events. Closes #1474, #1476.
const PERMISSIONS = {
  admin: ['*'],
  practitioner: ['records:read', 'records:write'],
  user: ['records:read'],
};

const hasPermission = (role, permission) => {
  const perms = PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
};

// Express middleware: 401 when unauthenticated, 403 when lacking permission.
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (!hasPermission(req.user.role, permission)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  return next();
};

const SECRET_KEYS = /pass(word)?|token|secret|authorization|otp|code/i;

function buildAuthAuditEvent(type, { userId, ip, meta = {} } = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(meta)) if (!SECRET_KEYS.test(k)) safe[k] = v;
  return { type, userId: userId || null, ip: ip || null, meta: safe, timestamp: new Date().toISOString() };
}

const AUTH_EVENTS = ['login_success', 'login_failure', 'logout', 'credential_change', 'recovery_used'];

module.exports = { PERMISSIONS, hasPermission, requirePermission, buildAuthAuditEvent, AUTH_EVENTS };
