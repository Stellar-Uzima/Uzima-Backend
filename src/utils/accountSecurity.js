// Reauthentication guard and enumeration-safe auth responses. Closes #1477, #1479.
const REAUTH_WINDOW_MS = 5 * 60 * 1000;

// Express middleware: sensitive changes need a recent authentication timestamp.
const requireRecentAuth = (windowMs = REAUTH_WINDOW_MS) => (req, res, next) => {
  const authAt = req.user && req.user.lastAuthenticatedAt ? new Date(req.user.lastAuthenticatedAt).getTime() : 0;
  if (!authAt || Date.now() - authAt > windowMs) {
    // Nothing is changed and no secrets are echoed back.
    return res.status(401).json({ success: false, message: 'Reauthentication required' });
  }
  return next();
};

// Same public message whether or not the account exists.
const PUBLIC_MESSAGES = {
  login: 'Invalid email or password',
  signup: 'If this email can be registered, a confirmation message has been sent',
  recovery: 'If an account exists for this email, recovery instructions have been sent',
};

function publicAuthResponse(kind) {
  const message = PUBLIC_MESSAGES[kind] || PUBLIC_MESSAGES.login;
  return { status: kind === 'login' ? 401 : 200, body: { success: kind !== 'login', message } };
}

module.exports = { REAUTH_WINDOW_MS, requireRecentAuth, publicAuthResponse };
