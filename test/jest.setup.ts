/**
 * Test setup file for Jest
 * Runs before and after test suite execution
 */

import { setupTestDatabase, teardownTestDatabase, beforeEachTest, afterEachTest } from './setup';

// Global setup - runs once before all tests
beforeAll(async () => {
  console.log('🚀 Starting test suite setup...');
  try {
    await setupTestDatabase();
    console.log('✅ Test database setup complete');
  } catch (error) {
    console.warn('⚠️  Test database not available - skipping DB-dependent tests');
  }
}, 60000);

// Per-test setup - clean database before each test
beforeEach(async () => {
  try {
    await beforeEachTest();
  } catch (error) {
    console.error('❌ Failed to setup before test', error);
  }
});

afterEach(async () => {
  try {
    await afterEachTest();
  } catch (error) {
    console.error('❌ Failed to cleanup after test', error);
  }
});

afterAll(async () => {
  try {
    await teardownTestDatabase();
    console.log('✅ Test database teardown complete');
  } catch (error) {
    console.warn('⚠️  Test database teardown failed', error);
  }
});