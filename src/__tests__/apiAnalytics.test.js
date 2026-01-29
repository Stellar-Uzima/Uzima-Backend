import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import APIMetric from '../models/APIMetric.js';
import { calculatePercentile } from '../utils/analyticsUtils.js';

/**
 * Integration Tests for API Analytics
 * Tests the full analytics pipeline including metrics recording and aggregation
 */

describe('API Analytics Integration Tests', () => {
  let testMetrics = [];
  const testStartDate = new Date('2024-01-01T00:00:00Z');

  beforeAll(async () => {
    // Ensure DB is connected (should already be from test setup)
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    }
  });

  afterAll(async () => {
    // Clean up test data
    await APIMetric.deleteMany({ endpoint: /\/test/ });
  });

  beforeEach(async () => {
    // Clear test metrics before each test
    await APIMetric.deleteMany({ endpoint: /\/test/ });
    testMetrics = [];
  });

  describe('APIMetric Model', () => {
    it('should create a metric with all required fields', async () => {
      const metric = await APIMetric.recordMetric({
        requestId: 'test-req-001',
        endpoint: '/api/test/endpoint',
        method: 'GET',
        statusCode: 200,
        duration: 150,
        userId: new mongoose.Types.ObjectId(),
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
        requestSize: 512,
        responseSize: 1024,
        cacheHit: false,
      });

      expect(metric).toBeDefined();
      expect(metric.requestId).toBe('test-req-001');
      expect(metric.endpoint).toBe('/api/test/endpoint');
      expect(metric.method).toBe('GET');
      expect(metric.statusCode).toBe(200);
      expect(metric.duration).toBe(150);
      expect(metric.isError).toBe(false);
    });

    it('should automatically classify error metrics', async () => {
      const metric4xx = await APIMetric.recordMetric({
        requestId: 'test-req-400',
        endpoint: '/api/test/notfound',
        method: 'GET',
        statusCode: 404,
        duration: 100,
      });

      const metric5xx = await APIMetric.recordMetric({
        requestId: 'test-req-500',
        endpoint: '/api/test/error',
        method: 'POST',
        statusCode: 500,
        duration: 300,
        errorMessage: 'Internal server error',
      });

      expect(metric4xx.isError).toBe(true);
      expect(metric4xx.is4xxError).toBe(true);
      expect(metric4xx.is5xxError).toBe(false);

      expect(metric5xx.isError).toBe(true);
      expect(metric5xx.is4xxError).toBe(false);
      expect(metric5xx.is5xxError).toBe(true);
    });

    it('should classify slow queries', async () => {
      const fastMetric = await APIMetric.recordMetric({
        requestId: 'test-req-fast',
        endpoint: '/api/test/fast',
        method: 'GET',
        statusCode: 200,
        duration: 50,
      });

      const slowMetric = await APIMetric.recordMetric({
        requestId: 'test-req-slow',
        endpoint: '/api/test/slow',
        method: 'GET',
        statusCode: 200,
        duration: 1500,
      });

      expect(fastMetric.isSlowQuery).toBe(false);
      expect(slowMetric.isSlowQuery).toBe(true);
    });

    it('should create unique indexes for query optimization', async () => {
      const indexInfo = await APIMetric.collection.getIndexes();
      const indexNames = Object.keys(indexInfo);

      expect(indexNames).toContain('endpoint_1_createdAt_-1');
      expect(indexNames).toContain('method_1_statusCode_1_createdAt_-1');
      expect(indexNames).toContain('statusCode_1_createdAt_-1');
    });
  });

  describe('Metrics Recording', () => {
    it('should record multiple requests for same endpoint', async () => {
      const endpoint = '/api/test/users';
      const methods = ['GET', 'POST', 'PUT'];

      for (let i = 0; i < 3; i++) {
        await APIMetric.recordMetric({
          requestId: `test-req-${i}`,
          endpoint,
          method: methods[i],
          statusCode: 200,
          duration: 100 + i * 50,
        });
      }

      const count = await APIMetric.countDocuments({ endpoint });
      expect(count).toBe(3);
    });

    it('should handle batch metric recording', async () => {
      const metricsToRecord = [];
      for (let i = 0; i < 10; i++) {
        metricsToRecord.push({
          requestId: `batch-req-${i}`,
          endpoint: '/api/test/batch',
          method: 'GET',
          statusCode: 200,
          duration: Math.random() * 1000,
        });
      }

      for (const metric of metricsToRecord) {
        await APIMetric.recordMetric(metric);
      }

      const count = await APIMetric.countDocuments({ endpoint: '/api/test/batch' });
      expect(count).toBe(10);
    });
  });

  describe('Aggregation Pipelines', () => {
    beforeEach(async () => {
      // Create test data with different status codes and durations
      const testData = [
        { endpoint: '/api/test/agg', method: 'GET', statusCode: 200, duration: 100 },
        { endpoint: '/api/test/agg', method: 'GET', statusCode: 200, duration: 150 },
        { endpoint: '/api/test/agg', method: 'GET', statusCode: 200, duration: 200 },
        { endpoint: '/api/test/agg', method: 'POST', statusCode: 201, duration: 300 },
        { endpoint: '/api/test/agg', method: 'POST', statusCode: 400, duration: 50 },
      ];

      for (let i = 0; i < testData.length; i++) {
        await APIMetric.recordMetric({
          requestId: `agg-req-${i}`,
          ...testData[i],
        });
      }
    });

    it('should aggregate metrics by endpoint', async () => {
      const pipeline = [
        { $match: { endpoint: '/api/test/agg' } },
        {
          $group: {
            _id: '$endpoint',
            totalRequests: { $sum: 1 },
            totalErrors: { $sum: { $cond: ['$isError', 1, 0] } },
            avgDuration: { $avg: '$duration' },
          },
        },
      ];

      const result = await APIMetric.aggregate(pipeline);

      expect(result).toHaveLength(1);
      expect(result[0].totalRequests).toBe(5);
      expect(result[0].totalErrors).toBe(1);
      expect(result[0].avgDuration).toBe(160); // (100+150+200+300+50)/5
    });

    it('should calculate percentiles correctly', async () => {
      const metrics = await APIMetric.find(
        { endpoint: '/api/test/agg', method: 'GET' },
        { duration: 1 }
      );
      const durations = metrics.map((m) => m.duration).sort((a, b) => a - b);

      const p50 = calculatePercentile(durations, 50);
      const p95 = calculatePercentile(durations, 95);
      const p99 = calculatePercentile(durations, 99);

      expect(p50).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);
      expect(p50).toBeGreaterThanOrEqual(100);
      expect(p99).toBeLessThanOrEqual(200);
    });

    it('should group by method and endpoint', async () => {
      const pipeline = [
        { $match: { endpoint: '/api/test/agg' } },
        {
          $group: {
            _id: {
              endpoint: '$endpoint',
              method: '$method',
            },
            count: { $sum: 1 },
          },
        },
      ];

      const result = await APIMetric.aggregate(pipeline);

      expect(result).toHaveLength(2);
      const getGroup = result.find((r) => r._id.method === 'GET');
      const postGroup = result.find((r) => r._id.method === 'POST');

      expect(getGroup.count).toBe(3);
      expect(postGroup.count).toBe(2);
    });

    it('should calculate error rate correctly', async () => {
      const pipeline = [
        { $match: { endpoint: '/api/test/agg' } },
        {
          $group: {
            _id: '$endpoint',
            totalRequests: { $sum: 1 },
            totalErrors: { $sum: { $cond: ['$isError', 1, 0] } },
          },
        },
        {
          $project: {
            errorRate: {
              $round: [
                { $multiply: [{ $divide: ['$totalErrors', '$totalRequests'] }, 100] },
                2,
              ],
            },
          },
        },
      ];

      const result = await APIMetric.aggregate(pipeline);

      expect(result[0].errorRate).toBe(20); // 1 error out of 5 = 20%
    });
  });

  describe('Time-Series Analytics', () => {
    beforeEach(async () => {
      // Create metrics across different hours
      const now = new Date();
      for (let hour = 0; hour < 3; hour++) {
        for (let i = 0; i < 5; i++) {
          const date = new Date(now);
          date.setHours(date.getHours() - hour);

          await APIMetric.recordMetric({
            requestId: `ts-req-${hour}-${i}`,
            endpoint: '/api/test/timeseries',
            method: 'GET',
            statusCode: i === 4 ? 500 : 200,
            duration: Math.random() * 500 + 100,
            createdAt: date,
          });
        }
      }
    });

    it('should aggregate metrics by hour', async () => {
      const pipeline = [
        { $match: { endpoint: '/api/test/timeseries' } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$createdAt' },
            },
            totalRequests: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const result = await APIMetric.aggregate(pipeline);

      expect(result.length).toBeGreaterThanOrEqual(3);
      result.forEach((hour) => {
        expect(hour.totalRequests).toBe(5);
        expect(hour.avgDuration).toBeGreaterThan(0);
      });
    });

    it('should track error rate over time', async () => {
      const pipeline = [
        { $match: { endpoint: '/api/test/timeseries' } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$createdAt' },
            },
            totalRequests: { $sum: 1 },
            errorCount: { $sum: { $cond: ['$isError', 1, 0] } },
          },
        },
        {
          $project: {
            timestamp: '$_id',
            errorRate: {
              $round: [
                { $multiply: [{ $divide: ['$errorCount', '$totalRequests'] }, 100] },
                2,
              ],
            },
          },
        },
        { $sort: { timestamp: 1 } },
      ];

      const result = await APIMetric.aggregate(pipeline);

      expect(result.length).toBeGreaterThanOrEqual(3);
      result.forEach((hour) => {
        expect(hour.errorRate).toBe(20); // 1 error per 5 requests
      });
    });
  });

  describe('Performance Optimization', () => {
    it('should use indexes for fast queries', async () => {
      // Create test data
      for (let i = 0; i < 100; i++) {
        await APIMetric.recordMetric({
          requestId: `perf-req-${i}`,
          endpoint: '/api/test/perf',
          method: 'GET',
          statusCode: 200,
          duration: Math.random() * 1000,
        });
      }

      const start = Date.now();
      const result = await APIMetric.find({
        endpoint: '/api/test/perf',
        method: 'GET',
      })
        .sort({ createdAt: -1 })
        .limit(10);
      const duration = Date.now() - start;

      expect(result.length).toBeLessThanOrEqual(10);
      expect(duration).toBeLessThan(500); // Should be fast with indexes
    });

    it('should efficiently aggregate large datasets', async () => {
      // Create larger test dataset
      const batchSize = 50;
      for (let i = 0; i < batchSize; i++) {
        await APIMetric.recordMetric({
          requestId: `agg-perf-${i}`,
          endpoint: '/api/test/aggperf',
          method: 'GET',
          statusCode: Math.random() > 0.9 ? 500 : 200,
          duration: Math.random() * 2000 + 100,
        });
      }

      const start = Date.now();
      const pipeline = [
        { $match: { endpoint: '/api/test/aggperf' } },
        {
          $group: {
            _id: '$endpoint',
            totalRequests: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
            p95: { $push: '$duration' },
          },
        },
      ];

      const result = await APIMetric.aggregate(pipeline).allowDiskUse(true);
      const duration = Date.now() - start;

      expect(result.length).toBe(1);
      expect(result[0].totalRequests).toBe(batchSize);
      expect(duration).toBeLessThan(200); // Should complete in <200ms
    });
  });

  describe('Data Quality', () => {
    it('should validate metric data types', async () => {
      const metric = await APIMetric.recordMetric({
        requestId: 'test-quality-001',
        endpoint: '/api/test/quality',
        method: 'GET',
        statusCode: 200,
        duration: 123.45,
      });

      expect(typeof metric.requestId).toBe('string');
      expect(typeof metric.duration).toBe('number');
      expect(typeof metric.statusCode).toBe('number');
      expect(metric.createdAt instanceof Date).toBe(true);
    });

    it('should handle missing optional fields', async () => {
      const metric = await APIMetric.recordMetric({
        requestId: 'test-minimal',
        endpoint: '/api/test/minimal',
        method: 'GET',
        statusCode: 200,
        duration: 100,
      });

      expect(metric).toBeDefined();
      expect(metric.userId).toBeNull();
      expect(metric.errorMessage).toBeNull();
      expect(metric.tags).toEqual([]);
    });

    it('should enforce required fields', async () => {
      try {
        await APIMetric.recordMetric({
          requestId: 'test-invalid',
          endpoint: '/api/test/invalid',
          method: 'GET',
          // Missing statusCode and duration
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Utility Functions', () => {
    it('should calculate percentiles correctly', () => {
      const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      const p25 = calculatePercentile(data, 25);
      const p50 = calculatePercentile(data, 50);
      const p75 = calculatePercentile(data, 75);
      const p95 = calculatePercentile(data, 95);

      expect(p25).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p75);
      expect(p75).toBeLessThanOrEqual(p95);
    });

    it('should handle edge cases in percentile calculation', () => {
      const singleValue = [50];
      const twoValues = [10, 20];

      expect(calculatePercentile(singleValue, 50)).toBe(50);
      expect(calculatePercentile(twoValues, 50)).toBeLessThanOrEqual(20);
      expect(calculatePercentile([], 50)).toBe(0); // Empty array
    });
  });
});
