// Two-factor (TOTP) verification and one-time recovery codes. Closes #1473, #1475.
const crypto = require('crypto');

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of str.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g) || [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

function totp(secret, time = Date.now(), step = 30, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// Accepts the current code plus one step either side for clock drift.
function verifyTotp(secret, token, time = Date.now()) {
  return [-1, 0, 1].some((w) => totp(secret, time + w * 30000) === String(token));
}

// Only hashes are stored; plain codes are shown to the user once.
function generateRecoveryCodes(count = 10) {
  const codes = Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
  return { codes, hashes: codes.map(sha256) };
}

// Returns remaining hashes if the code is valid (single use), else null.
function consumeRecoveryCode(hashes, code) {
  const h = sha256(String(code).trim().toLowerCase());
  return hashes.includes(h) ? hashes.filter((x) => x !== h) : null;
}

module.exports = { totp, verifyTotp, generateRecoveryCodes, consumeRecoveryCode };
