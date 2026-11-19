// Session metadata and password history checks. Closes #1478, #1480.
const crypto = require('crypto');

// Only safe client details are kept; the IP is hashed so it is not exposed directly.
function buildSessionMetadata(req, now = new Date()) {
  const ip = (req.ip || '').toString();
  return {
    createdAt: now,
    lastActivityAt: now,
    userAgent: String(req.headers['user-agent'] || 'unknown').slice(0, 200),
    ipHash: ip ? crypto.createHash('sha256').update(ip).digest('hex') : null,
  };
}

const touchSession = (session, now = new Date()) => ({ ...session, lastActivityAt: now });

const RETENTION = Number(process.env.PASSWORD_HISTORY_COUNT || 5);

// `compare(plain, hash)` is injected (e.g. bcrypt.compare) so no plaintext is stored or logged.
async function isPasswordReused(newPassword, previousHashes = [], compare, retention = RETENTION) {
  for (const hash of previousHashes.slice(-retention)) {
    if (await compare(newPassword, hash)) return true;
  }
  return false;
}

const addToHistory = (previousHashes = [], newHash, retention = RETENTION) =>
  [...previousHashes, newHash].slice(-retention);

module.exports = { buildSessionMetadata, touchSession, isPasswordReused, addToHistory };
