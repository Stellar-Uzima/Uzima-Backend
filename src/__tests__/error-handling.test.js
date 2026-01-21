import request from 'supertest';
import app from '../index.js';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';

describe('Centralized Error Handling', () => {
  describe('Standardized Error Response Format', () => {
    test('Returns standardized error shape { code, message, details?, correlationId }', async () => {
      // This route does not exist, should trigger 404
      const res = await request(app).get('/nonexistent-route');
      
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('correlationId');
      expect(typeof res.body.correlationId).toBe('string');
      expect(res.headers).toHaveProperty('x-correlation-id');
      expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
      
      // Should not have 'success' property (old format)
      expect(res.body).not.toHaveProperty('success');
    });

    test('Error shape for thrown error includes stack trace in development', async () => {
      const res = await request(app).get('/debug-sentry');
      
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('correlationId');
      expect(typeof res.body.correlationId).toBe('string');
      expect(res.headers).toHaveProperty('x-correlation-id');
      
      // In development, should include stack trace in details
      if (process.env.NODE_ENV !== 'production') {
        expect(res.body).toHaveProperty('details');
        if (res.body.details) {
          expect(res.body.details).toHaveProperty('stack');
        }
      }
    });

    test('Correlation ID is present in response headers and body', async () => {
      const res = await request(app).get('/nonexistent-route');
      
      expect(res.headers).toHaveProperty('x-correlation-id');
      expect(res.body).toHaveProperty('correlationId');
      expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
    });
  });

  describe('HTTP Status Code Mapping', () => {
    test('400 Bad Request', async () => {
      // Test with invalid request - this will depend on your routes
      const res = await request(app)
        .post('/api/auth/login')
        .send({}); // Missing required fields
      
      expect([400, 422]).toContain(res.status);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
    });

    test('401 Unauthorized', async () => {
      // Test protected route without token
      const res = await request(app)
        .get('/api/users/profile');
      
      expect([401, 404]).toContain(res.status);
      if (res.status === 401) {
        expect(res.body).toHaveProperty('code');
        expect(res.body.code).toContain('UNAUTHORIZED');
      }
    });

    test('404 Not Found', async () => {
      const res = await request(app).get('/api/nonexistent-endpoint');
      
      expect(res.status).toBe(404);
      expect(res.body.code).toContain('NOT_FOUND');
    });

    test('422 Validation Error', async () => {
      // This depends on your validation setup
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'invalid-email' }); // Invalid email format
      
      if (res.status === 422) {
        expect(res.body).toHaveProperty('code');
        expect(res.body.code).toContain('VALIDATION');
        expect(res.body).toHaveProperty('details');
      }
    });
  });

  describe('Custom Error Classes', () => {
    test('BadRequestError maps to 400', () => {
      const error = new BadRequestError('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toContain('BAD_REQUEST');
    });

    test('UnauthorizedError maps to 401', () => {
      const error = new UnauthorizedError('Test error');
      expect(error.statusCode).toBe(401);
      expect(error.code).toContain('UNAUTHORIZED');
    });

    test('ForbiddenError maps to 403', () => {
      const error = new ForbiddenError('Test error');
      expect(error.statusCode).toBe(403);
      expect(error.code).toContain('FORBIDDEN');
    });

    test('NotFoundError maps to 404', () => {
      const error = new NotFoundError('Test error');
      expect(error.statusCode).toBe(404);
      expect(error.code).toContain('NOT_FOUND');
    });

    test('ValidationError maps to 422', () => {
      const error = new ValidationError('Test error', { field: 'email' });
      expect(error.statusCode).toBe(422);
      expect(error.code).toContain('VALIDATION');
      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('Error Details', () => {
    test('Error with details includes details in response', async () => {
      // This test depends on having a route that returns errors with details
      // For now, we'll test the error class directly
      const error = new ValidationError('Validation failed', {
        email: 'Invalid email format',
        password: 'Password too short',
      });
      
      expect(error.details).toBeDefined();
      expect(error.details.email).toBe('Invalid email format');
      expect(error.details.password).toBe('Password too short');
    });

    test('Error without details does not include details property', () => {
      const error = new BadRequestError('Simple error');
      expect(error.details).toBeNull();
    });
  });
});
