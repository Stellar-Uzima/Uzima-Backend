import { logger } from '../utils/logger.js';

const ALLOWED_IPS = (process.env.HEALTH_CHECK_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean);

const IP_RESTRICTION_ENABLED = ALLOWED_IPS.length > 0;

function checkCIDR(ip, cidr) {
  const [cidrIp, maskStr] = cidr.split('/');
  const mask = parseInt(maskStr, 10) || 32;
  const ipParts = ip.split('.').map(Number);
  const cidrParts = cidrIp.split('.').map(Number);

  for (let i = 0; i < 4; i++) {
    const bits = Math.min(8, Math.max(0, mask - i * 8));
    const ipMask = (0xff << (8 - bits)) & 0xff;
    if ((ipParts[i] & ipMask) !== (cidrParts[i] & ipMask)) {
      return false;
    }
  }
  return true;
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function isIpAllowed(ip) {
  return ALLOWED_IPS.some(allowedIp =>
    allowedIp.includes('/') ? checkCIDR(ip, allowedIp) : ip === allowedIp
  );
}

export function ipRestrictionMiddleware(req, res, next) {
  if (!IP_RESTRICTION_ENABLED) {
    return next();
  }

  const clientIp = getClientIp(req);

  if (isIpAllowed(clientIp)) {
    return next();
  }

  logger.warn(`Health endpoint access denied from IP: ${clientIp}`);
  return res.status(403).json({
    status: 'forbidden',
    message: 'Access denied',
    timestamp: new Date().toISOString(),
  });
}

export default ipRestrictionMiddleware;
