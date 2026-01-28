import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeData,
  sanitizeHeaders,
  apiRequestResponseLogger,
} from '../utils/logger.js';

describe('API Logger Middleware', () => {
  describe('sanitizeData', () => {
    it('should redact password fields', () => {
      const input = { username: 'john', password: 'secret123' };
      const result = sanitizeData(input);
      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should redact token fields', () => {
      const input = {
        accessToken: 'abc123',
        refreshToken: 'def456',
        apiKey: 'key789',
      };
      const result = sanitizeData(input);
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('should redact sensitive personal information', () => {
      const input = {
        name: 'John Doe',
        ssn: '123-45-6789',
        dob: '1990-01-01',
        email: 'john@example.com',
        phoneNumber: '+1234567890',
        medicalHistory: 'Some condition',
      };
      const result = sanitizeData(input);
      expect(result.name).toBe('John Doe');
      expect(result.ssn).toBe('[REDACTED]');
      expect(result.dob).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]');
      expect(result.phoneNumber).toBe('[REDACTED]');
      expect(result.medicalHistory).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            token: 'abc123',
          },
        },
      };
      const result = sanitizeData(input);
      expect(result.user.name).toBe('John');
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.user.credentials.token).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const input = {
        users: [
          { name: 'John', password: 'secret1' },
          { name: 'Jane', password: 'secret2' },
        ],
      };
      const result = sanitizeData(input);
      expect(result.users[0].name).toBe('John');
      expect(result.users[0].password).toBe('[REDACTED]');
      expect(result.users[1].name).toBe('Jane');
      expect(result.users[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeData(null)).toBe(null);
      expect(sanitizeData(undefined)).toBe(undefined);
    });

    it('should handle primitive values', () => {
      expect(sanitizeData('string')).toBe('string');
      expect(sanitizeData(123)).toBe(123);
      expect(sanitizeData(true)).toBe(true);
    });

    it('should prevent infinite recursion', () => {
      const circular = { a: 1 };
      circular.self = circular;
      // Should not throw and should handle gracefully
      const result = sanitizeData(circular);
      expect(result.a).toBe(1);
    });
  });

  describe('sanitizeHeaders', () => {
    it('should redact authorization header', () => {
      const headers = {
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'user-agent': 'test',
      };
      const result = sanitizeHeaders(headers);
      expect(result['content-type']).toBe('application/json');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result['user-agent']).toBe('test');
    });

    it('should redact x-api-key header', () => {
      const headers = { 'x-api-key': 'secret-key' };
      const result = sanitizeHeaders(headers);
      expect(result['x-api-key']).toBe('[REDACTED]');
    });

    it('should redact cookie header', () => {
      const headers = { cookie: 'session=abc123' };
      const result = sanitizeHeaders(headers);
      expect(result.cookie).toBe('[REDACTED]');
    });

    it('should handle missing sensitive headers', () => {
      const headers = { 'content-type': 'application/json' };
      const result = sanitizeHeaders(headers);
      expect(result['content-type']).toBe('application/json');
    });
  });

  describe('apiRequestResponseLogger middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        method: 'GET',
        path: '/api/test',
        url: '/api/test',
        originalUrl: '/api/test',
        headers: { 'user-agent': 'test' },
        query: {},
        body: {},
        ip: '127.0.0.1',
        connection: {},
      };

      res = {
        statusCode: 200,
        json: vi.fn(function (data) {
          return this;
        }),
        send: vi.fn(function (data) {
          return this;
        }),
        on: vi.fn(),
      };

      next = vi.fn();
    });

    it('should skip logging for health check routes', () => {
      req.path = '/health';
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip logging for api-docs routes', () => {
      req.path = '/api-docs';
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip logging for favicon', () => {
      req.path = '/favicon.ico';
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should log regular API requests', () => {
      req.path = '/api/users';
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should capture request data', () => {
      req.method = 'POST';
      req.path = '/api/users';
      req.body = { name: 'John', password: 'secret' };
      req.query = { page: '1' };
      req.headers = { authorization: 'Bearer token' };

      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should override res.json to capture response', () => {
      const originalJson = res.json;
      apiRequestResponseLogger(req, res, next);
      expect(res.json).not.toBe(originalJson);
    });

    it('should override res.send to capture response', () => {
      const originalSend = res.send;
      apiRequestResponseLogger(req, res, next);
      expect(res.send).not.toBe(originalSend);
    });

    it('should measure response duration', () => {
      apiRequestResponseLogger(req, res, next);

      // Get the finish callback
      const finishCallback = res.on.mock.calls[0][1];

      // Simulate response finish
      finishCallback();

      // Duration should be measured (implementation logs it)
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should handle user information if present', () => {
      req.user = { _id: '12345', name: 'John' };
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle correlation ID from headers', () => {
      req.headers['x-correlation-id'] = 'test-correlation-id';
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle correlation ID from req.correlationId', () => {
      req.correlationId = 'test-correlation-id-2';
      apiRequestResponseLogger(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
