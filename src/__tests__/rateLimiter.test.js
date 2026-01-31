// Mock Redis client to avoid connection issues during testing
jest.mock(
  '../config/redis.js',
  () => ({
    default: {
      sendCommand: jest.fn(),
      on: jest.fn(),
      connect: jest.fn(),
      quit: jest.fn(),
    },
  }),
  { virtual: true }
);

import { generalRateLimit, authRateLimit, twoFactorRateLimit } from '../middleware/rateLimiter.js';

describe('Rate Limiting Middleware Tests', () => {
  describe('Rate Limit Configuration', () => {
    it('should have correct configuration for general rate limit', () => {
      expect(generalRateLimit).toBeDefined();
      expect(generalRateLimit.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(generalRateLimit.max).toBe(100);
    });

    it('should have correct configuration for auth rate limit', () => {
      expect(authRateLimit).toBeDefined();
      expect(authRateLimit.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(authRateLimit.max).toBe(5);
    });

    it('should have correct configuration for 2FA rate limit', () => {
      expect(twoFactorRateLimit).toBeDefined();
      expect(twoFactorRateLimit.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(twoFactorRateLimit.max).toBe(10);
    });
  });

  describe('Rate Limit Options', () => {
    it('should have standard headers enabled', () => {
      expect(generalRateLimit.standardHeaders).toBe(true);
      expect(authRateLimit.standardHeaders).toBe(true);
      expect(twoFactorRateLimit.standardHeaders).toBe(true);
    });

    it('should have legacy headers disabled', () => {
      expect(generalRateLimit.legacyHeaders).toBe(false);
      expect(authRateLimit.legacyHeaders).toBe(false);
      expect(twoFactorRateLimit.legacyHeaders).toBe(false);
    });

    it('should have custom handlers defined', () => {
      expect(typeof generalRateLimit.handler).toBe('function');
      expect(typeof authRateLimit.handler).toBe('function');
      expect(typeof twoFactorRateLimit.handler).toBe('function');
    });
  });

  describe('Key Generation', () => {
    it('should have keyGenerator function defined', () => {
      expect(typeof generalRateLimit.keyGenerator).toBe('function');
      expect(typeof authRateLimit.keyGenerator).toBe('function');
      expect(typeof twoFactorRateLimit.keyGenerator).toBe('function');
    });

    it('should generate correct keys for different scenarios', () => {
      const mockReq = {
        ip: '192.168.1.1',
        user: { id: 'user123' },
      };

      // Test authenticated user key generation
      const userKey = generalRateLimit.keyGenerator(mockReq);
      expect(userKey).toBe('user:user123');

      // Test anonymous user key generation
      const anonymousReq = { ip: '192.168.1.1' };
      const ipKey = generalRateLimit.keyGenerator(anonymousReq);
      expect(ipKey).toMatch(/^ip:/); // Should start with 'ip:'
    });
  });

  describe('Skip Function', () => {
    it('should have skip function defined', () => {
      expect(typeof generalRateLimit.skip).toBe('function');
      expect(typeof authRateLimit.skip).toBe('function');
      expect(typeof twoFactorRateLimit.skip).toBe('function');
    });

    it('should skip successful requests', () => {
      const mockReq = {};
      const mockRes = { statusCode: 200 };

      expect(generalRateLimit.skip(mockReq, mockRes)).toBe(true);
    });

    it('should not skip failed requests', () => {
      const mockReq = {};
      const mockRes = { statusCode: 400 };

      expect(generalRateLimit.skip(mockReq, mockRes)).toBe(false);
    });
  });

  describe('Handler Function', () => {
    it('should return proper 429 response structure', () => {
      const mockReq = {
        rateLimit: {
          limit: 100,
          remaining: 0,
          resetTime: Date.now() + 900000, // 15 minutes from now
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      generalRateLimit.handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: expect.any(Number),
          limit: 100,
          remaining: 0,
          resetTime: expect.any(String),
        })
      );
    });
  });
});
