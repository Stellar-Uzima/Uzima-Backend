/**
 * Jest Environment Variables Setup
 * Loads and validates environment variables before tests run
 */

import 'dotenv/config';

// Set test environment
process.env.NODE_ENV = 'test';

// Test database configuration
process.env.TEST_DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.TEST_DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.TEST_DB_USERNAME = process.env.TEST_DB_USERNAME || 'postgres';
process.env.TEST_DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'postgres';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'uzima_test';

// Disable logging during tests for cleaner output
process.env.TEST_DB_LOGGING = process.env.TEST_DB_LOGGING || 'false';

// Redis configuration for tests
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';

// JWT configuration
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key';
process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  };
}
