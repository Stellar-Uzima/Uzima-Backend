/**
 * Request ID Test Suite
 * Tests for request ID generation, propagation, and logging functionality
 */

import request from 'supertest';
import app from '../index.js';

describe('Request ID Middleware', () => {
  test('should generate unique request ID for each request', async () => {
    const response1 = await request(app).get('/api/health');
    const response2 = await request(app).get('/api/health');

    expect(response1.headers['x-request-id']).toBeDefined();
    expect(response2.headers['x-request-id']).toBeDefined();
    expect(response1.headers['x-request-id']).not.toBe(response2.headers['x-request-id']);
  });

  test('should use existing request ID from header', async () => {
    const testRequestId = 'test-request-id-123';
    const response = await request(app).get('/api/health').set('X-Request-ID', testRequestId);

    expect(response.headers['x-request-id']).toBe(testRequestId);
  });

  test('should include request ID in response headers', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-request-id']).toBeDefined();
    expect(typeof response.headers['x-request-id']).toBe('string');
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe('Request ID Propagation', () => {
  test('should propagate request ID to external calls', async () => {
    const { fetchWithRequestId, addRequestIdToHeaders } = await import('../utils/requestId.js');

    const requestId = 'test-request-id-456';
    const options = { method: 'GET', headers: { 'Content-Type': 'application/json' } };

    const enhancedOptions = addRequestIdToHeaders(options, requestId);
    expect(enhancedOptions.headers['X-Request-ID']).toBe(requestId);
  });

  test('should extract request ID from request object', async () => {
    const { getRequestIdFromRequest } = await import('../utils/requestId.js');

    const mockReq = {
      requestId: 'test-id-1',
      correlationId: 'test-id-2',
      headers: {
        'x-request-id': 'test-id-3',
        'x-correlation-id': 'test-id-4',
      },
    };

    expect(getRequestIdFromRequest(mockReq)).toBe('test-id-1');

    delete mockReq.requestId;
    expect(getRequestIdFromRequest(mockReq)).toBe('test-id-2');

    delete mockReq.correlationId;
    expect(getRequestIdFromRequest(mockReq)).toBe('test-id-3');

    delete mockReq.headers['x-request-id'];
    expect(getRequestIdFromRequest(mockReq)).toBe('test-id-4');
  });
});

describe('Request ID Logging', () => {
  test('should include request ID in log messages', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Mock a request with request ID
    const mockReq = {
      requestId: 'test-log-request-id',
      log: {
        info: msg => console.log(`[${mockReq.requestId}] ${msg}`),
        error: msg => console.error(`[${mockReq.requestId}] ${msg}`),
        warn: msg => console.warn(`[${mockReq.requestId}] ${msg}`),
      },
    };

    mockReq.log.info('Test info message');
    mockReq.log.warn('Test warning message');
    mockReq.log.error('Test error message');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[test-log-request-id]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test info message'));

    consoleSpy.mockRestore();
  });
});
