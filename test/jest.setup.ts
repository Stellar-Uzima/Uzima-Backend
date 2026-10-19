import { setupTestDatabase, teardownTestDatabase } from './setup';

// A fresh database per suite preserves intentional state between journey steps.
// Independent cases can use beforeEachTest/afterEachTest or IsolatedTestRunner.
beforeAll(async () => {
  await setupTestDatabase();
}, 60000);
afterAll(async () => {
  await teardownTestDatabase();
}, 60000);
jest.setTimeout(30000);
