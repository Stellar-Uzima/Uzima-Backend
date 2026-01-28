import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.js';
import dotenv from 'dotenv';

dotenv.config();

const getClientIp = req => {
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
};

const isWhitelistedIp = ip => {
  const whitelist = process.env.RATE_LIMIT_WHITELIST_IPS;
  if (!whitelist) {
    return false;
  }
  const whitelistIps = whitelist
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
  return whitelistIps.includes(ip);
};

const createStore = () => {
  try {
    if (!redisClient) {
      console.warn('Redis client not available, using memory store for rate limiting');
      return undefined;
    }

    return new RedisStore({
      sendCommand: async (...args) => {
        try {
          if (!redisClient) {
            throw new Error('Redis client not available');
          }
          return await redisClient.sendCommand(args);
        } catch (error) {
          throw error;
        }
      },
      prefix: 'rl:',
    });
  } catch (error) {
    console.warn(
      'Redis store creation failed, using memory store for rate limiting:',
      error.message
    );
    return undefined;
  }
};

const generateIpKey = (req, prefix = '') => {
  const ip = getClientIp(req);
  return prefix ? `${prefix}:${ip}` : `ip:${ip}`;
};

const createRateLimitHandler = (customMessage = 'Too many requests') => {
  return (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json({
      code: 'errors.RATE_LIMIT_EXCEEDED',
      message: customMessage,
      retryAfter,
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining,
      resetTime: new Date(req.rateLimit.resetTime).toISOString(),
    });
  };
};

export const generalRateLimit = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: req => generateIpKey(req, 'global'),
  skip: req => {
    const ip = getClientIp(req);
    return isWhitelistedIp(ip);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many requests from this IP, please try again later.'),
});

export const authRateLimit = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: req => generateIpKey(req, 'auth'),
  skip: req => {
    const ip = getClientIp(req);
    return isWhitelistedIp(ip);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many authentication attempts from this IP, please try again later.'
  ),
});

export const passwordResetRateLimit = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: req => generateIpKey(req, 'password-reset'),
  skip: req => {
    const ip = getClientIp(req);
    return isWhitelistedIp(ip);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many password reset attempts from this IP, please try again later.'
  ),
});

export const twoFactorRateLimit = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: req => generateIpKey(req, '2fa'),
  skip: req => {
    const ip = getClientIp(req);
    return isWhitelistedIp(ip);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many 2FA attempts from this IP, please try again later.'),
});

export const uploadRateLimit = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: req => generateIpKey(req, 'upload'),
  skip: req => {
    const ip = getClientIp(req);
    return isWhitelistedIp(ip);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many file uploads from this IP, please try again later.'),
});

export const adminRateLimit = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: req => generateIpKey(req, 'admin'),
  skip: req => {
    const ip = getClientIp(req);
    return isWhitelistedIp(ip);
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many admin requests from this IP, please try again later.'),
});

export const createCustomRateLimit = (options = {}) => {
  const defaults = {
    store: createStore(),
    keyGenerator: req => generateIpKey(req),
    skip: req => {
      const ip = getClientIp(req);
      return isWhitelistedIp(ip);
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitHandler('Too many requests from this IP, please try again later.'),
  };

  return rateLimit({ ...defaults, ...options });
};
