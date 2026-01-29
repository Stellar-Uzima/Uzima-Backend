import crypto from 'crypto';

export function randomSalt(length = 16) {
  return crypto.randomBytes(length).toString('hex');
}

export function deterministicHash(data, salt) {
  if (!salt) throw new Error('Salt is required for deterministic hashing');
  return crypto
    .createHmac('sha256', salt)
    .update(JSON.stringify(data))
    .digest('hex');
}

export function sha256Hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function redact(data, maskChar = '*') {
  if (typeof data !== 'string') return data;
  if (data.length <= 4) return maskChar.repeat(data.length);
  return maskChar.repeat(data.length - 4) + data.slice(-4);
}

