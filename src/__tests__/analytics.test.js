import { vi, describe, it, expect, beforeEach } from 'vitest';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import analyticsService from '../services/analyticsService.js';
import cacheHelper from '../utils/cacheHelper.js';

// Setup Mock Environment Variables for Encryption
process.env.ENCRYPTION_KEY_SECRET_v1 =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY_CURRENT_VERSION = 'v1';

// Mock cache helper to bypass Redis
vi.mock('../utils/cacheHelper.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    generateKey: vi.fn((endpoint, params) => `${endpoint}:${JSON.stringify(params)}`),
    clearPattern: vi.fn().mockResolvedValue(true),
  },
  cacheHelper: {
    // Named export
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    generateKey: vi.fn((endpoint, params) => `${endpoint}:${JSON.stringify(params)}`),
    clearPattern: vi.fn().mockResolvedValue(true),
  },
}));

describe('Analytics Service', () => {
  // Helpers
  const createDates = () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { start, end };
  };

  beforeEach(async () => {
    // Clear data is handled by setup.js via afterEach
    vi.clearAllMocks();
  });

  describe('User Analytics', () => {
    it('should calculate user growth and stats correctly', async () => {
      const { start, end } = createDates();

      // Create users in current period
      await User.create([
        {
          username: 'user1',
          email: 'user1@example.com',
          password: 'password',
          role: 'patient',
          createdAt: new Date(end.getTime() - 1000000),
        },
        {
          username: 'user2',
          email: 'user2@example.com',
          password: 'password',
          role: 'doctor',
          createdAt: new Date(end.getTime() - 2000000),
        },
      ]);

      // Create users in previous period
      const prevDate = new Date(start);
      prevDate.setDate(prevDate.getDate() - 10);
      await User.create([
        {
          username: 'olduser1',
          email: 'old@example.com',
          password: 'password',
          role: 'patient',
          createdAt: prevDate,
        },
      ]);

      const result = await analyticsService.getUserAnalytics(start, end);

      expect(result.summary.totalUsers).toBe(3);
      expect(result.summary.newRegistrations).toBe(2);
      expect(result.roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: 'patient', count: 2 }), // 1 new + 1 old
          expect.objectContaining({ _id: 'doctor', count: 1 }),
        ])
      );

      expect(result.summary.growth.registrations).not.toBe('N/A');
    });
  });

  describe('Activity Analytics', () => {
    it('should aggregate activity stats correctly', async () => {
      const { start, end } = createDates();
      const midPoint = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);

      // Create user
      const user = await User.create({
        username: 'active1',
        email: 'active1@example.com',
        password: 'pass',
        role: 'patient',
      });

      // Create logs
      await ActivityLog.create([
        {
          userId: user._id,
          action: 'login',
          result: 'success',
          timestamp: midPoint,
          duration: 100,
        },
        {
          userId: user._id,
          action: 'record_view',
          result: 'success',
          timestamp: midPoint,
          duration: 50,
        },
        {
          userId: user._id,
          action: 'login', // failure
          result: 'failure',
          timestamp: midPoint,
          duration: 20,
        },
      ]);

      const result = await analyticsService.getActivityAnalytics(start, end);

      expect(result.summary.totalActions).toBe(3);
      // Success rate: 2/3 = 66.67%
      expect(result.summary.successRate).toContain('66.67%');

      // Check breakdown
      const loginAction = result.breakdown.find(b => b._id === 'login');
      expect(loginAction).toBeDefined();
      expect(loginAction.count).toBe(2);
    });
  });

  describe('Performance Analytics', () => {
    it('should calculate response time metrics', async () => {
      const { start, end } = createDates();
      const midPoint = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);

      const user = await User.create({
        username: 'perf',
        email: 'p@e.com',
        password: 'p',
        role: 'admin',
      });

      await ActivityLog.create([
        {
          userId: user._id,
          action: 'api_access',
          timestamp: midPoint,
          duration: 20,
          result: 'success',
        },
        {
          userId: user._id,
          action: 'data_access',
          timestamp: midPoint,
          duration: 1000,
          result: 'success',
        },
        {
          userId: user._id,
          action: 'record_view',
          timestamp: midPoint,
          duration: 480,
          result: 'success',
        },
      ]);

      const result = await analyticsService.getPerformanceAnalytics(start, end);

      expect(parseInt(result.summary.totalRequests)).toBe(3);
      expect(parseInt(result.summary.avgResponseTime)).toBe(500); // (20+1000+480)/3 = 500
      expect(result.summary.minResponseTime).toBe('20ms');
      expect(result.summary.maxResponseTime).toBe('1000ms');

      expect(result.slowestEndpoints[0]._id).toBe('data_access');
    });
  });

  describe('Error Analytics', () => {
    it('should track errors correctly', async () => {
      const { start, end } = createDates();
      const midPoint = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);

      const user = await User.create({
        username: 'err',
        email: 'e@e.com',
        password: 'p',
        role: 'admin',
      });

      await ActivityLog.create([
        {
          userId: user._id,
          action: 'payment_failed',
          timestamp: midPoint,
          duration: 20,
          result: 'failure',
          errorMessage: 'Bad Request',
        },
        {
          userId: user._id,
          action: 'system_error',
          timestamp: midPoint,
          duration: 10,
          result: 'failure',
          errorMessage: 'Crash',
        },
        { userId: user._id, action: 'login', timestamp: midPoint, duration: 10, result: 'success' },
      ]);

      const result = await analyticsService.getErrorAnalytics(start, end);

      expect(result.summary.totalErrors).toBe(2);
      expect(result.summary.errorRate).toBe('66.67%'); // 2 errors out of 3 total activities

      expect(result.topErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: 'Bad Request', count: 1 }),
          expect.objectContaining({ _id: 'Crash', count: 1 }),
        ])
      );
    });
  });
});
