/** Shared E2E helpers. Database lifecycle lives in database-manager.ts. */
import { ObjectLiteral, Repository } from 'typeorm';
import { TestDatabaseManager } from './database-manager';
export { TestDatabaseManager } from './database-manager';

export async function setupTestDB(): Promise<void> {
  await setupTestDatabase();
}
export async function teardownTestDB(): Promise<void> {
  await teardownTestDatabase();
}
export async function clearTestDB(): Promise<void> {
  await beforeEachTest();
}
export async function setupTestDatabase(): Promise<void> {
  await TestDatabaseManager.getInstance().initialize();
}
export async function teardownTestDatabase(): Promise<void> {
  await TestDatabaseManager.getInstance().close();
}
export async function beforeEachTest(): Promise<void> {
  await TestDatabaseManager.getInstance().cleanDatabase();
}
export async function afterEachTest(): Promise<void> {
  await TestDatabaseManager.getInstance().cleanDatabase();
}

/** Explicit isolation for independent cases, including application repositories. */
export class IsolatedTestRunner {
  private dbManager = TestDatabaseManager.getInstance();
  async runTest<T>(testFn: () => Promise<T>): Promise<T> {
    await this.dbManager.cleanDatabase();
    try {
      return await testFn();
    } finally {
      await this.dbManager.cleanDatabase();
    }
  }
  async runTests<T>(
    tests: Array<{ name: string; fn: () => Promise<T> }>
  ): Promise<Array<{ name: string; result?: T; error?: Error }>> {
    const results: Array<{ name: string; result?: T; error?: Error }> = [];
    for (const test of tests) {
      try {
        results.push({ name: test.name, result: await this.runTest(test.fn) });
      } catch (error) {
        results.push({ name: test.name, error: error as Error });
      }
    }
    return results;
  }
}

/**
 * Test fixture manager for consistent test data setup
 */
export class TestFixtureManager {
  private dbManager = TestDatabaseManager.getInstance();
  private fixtures: Map<string, any[]> = new Map();

  /**
   * Register fixture data
   */
  registerFixture<T>(name: string, data: T[]): void {
    this.fixtures.set(name, data);
  }

  /**
   * Get fixture data
   */
  getFixture<T>(name: string): T[] {
    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(`Fixture '${name}' not found`);
    }
    return fixture as T[];
  }

  /**
   * Load fixtures into database
   */
  async loadFixture<Entity extends ObjectLiteral>(
    name: string,
    repository: Repository<Entity>
  ): Promise<Entity[]> {
    const data = this.getFixture<Entity>(name);
    return repository.save(data);
  }

  /**
   * Load multiple fixtures
   */
  async loadFixtures(
    fixtures: Array<{ name: string; repository: Repository<any> }>
  ): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();
    for (const { name, repository } of fixtures) {
      const data = await this.loadFixture(name, repository);
      results.set(name, data);
    }
    return results;
  }

  /**
   * Clear all registered fixtures
   */
  clearFixtures(): void {
    this.fixtures.clear();
  }
}
