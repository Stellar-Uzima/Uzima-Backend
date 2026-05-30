/**
 * Jest Setup and Teardown Hooks
 * Runs before and after test suite execution
 */

import { setupTestDatabase, teardownTestDatabase, beforeEachTest, afterEachTest } from './setup';

// Allow skipping DB setup for isolated unit tests
if (process.env.SKIP_DB_SETUP === 'true') {
  console.log('⚠️ SKIP_DB_SETUP enabled - skipping global DB setup');
} else {
  // Global setup - runs once before all tests
  beforeAll(async () => {
    console.log('🚀 Starting test suite setup...');
    try {
      await setupTestDatabase();
      console.log('✅ Test database setup complete');
    } catch (error) {
      console.error('❌ Failed to setup test database', error);
      process.exit(1);
    }
  }, 60000); // 60 second timeout for setup
}

// Per-test setup - clean database before each test
beforeEach(async () => {
  try {
    await beforeEachTest();
  } catch (error) {
    console.error('❌ Failed to setup before test', error);
  }
});

// Per-test teardown - cleanup after each test
afterEach(async () => {
  try {
    await afterEachTest();
  } catch (error) {
    console.error('❌ Failed to cleanup after test', error);
  }
});

// Global teardown - runs once after all tests
afterAll(async () => {
  console.log('🧹 Tearing down test database...');
  try {
    await teardownTestDatabase();
    console.log('✅ Test database teardown complete');
  } catch (error) {
    console.error('❌ Failed to teardown test database', error);
    process.exit(1);
  }
}, 60000); // 60 second timeout for teardown

// Increase timeout for slow tests
jest.setTimeout(30000);

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Promise Rejection:', error);
});
