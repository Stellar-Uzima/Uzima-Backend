import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import migrationRunner from '../services/migrationRunner.js';
import Migration from '../models/Migration.js';
import MigrationLock from '../models/MigrationLock.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Migration System', () => {
  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/uzima-test';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Migration.deleteMany({});
    await MigrationLock.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear migrations before each test
    await Migration.deleteMany({});
    await MigrationLock.deleteMany({});
  });

  describe('Migration Runner', () => {
    it('should get pending migrations', async () => {
      const pending = await migrationRunner.getPendingMigrations();
      expect(Array.isArray(pending)).toBe(true);
    });

    it('should get migration files', async () => {
      const files = await migrationRunner.getMigrationFiles();
      expect(Array.isArray(files)).toBe(true);
    });

    it('should extract version from filename', () => {
      const version1 = migrationRunner.extractVersion('20250122001-add-index.js');
      expect(version1).toBe('20250122001');

      const version2 = migrationRunner.extractVersion('20250101999-another.js');
      expect(version2).toBe('20250101999');

      const invalid = migrationRunner.extractVersion('invalid-file.js');
      expect(invalid).toBeNull();
    });

    it('should get migration status', async () => {
      const status = await migrationRunner.getStatus();

      expect(status).toHaveProperty('applied');
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('failed');
      expect(status).toHaveProperty('summary');
      expect(status).toHaveProperty('locked');

      expect(Array.isArray(status.applied)).toBe(true);
      expect(Array.isArray(status.pending)).toBe(true);
      expect(Array.isArray(status.failed)).toBe(true);
    });

    it('should get next batch number', async () => {
      const batch1 = await migrationRunner.getNextBatchNumber();
      expect(batch1).toBe(1);

      // Create a migration record
      await Migration.create({
        version: '20250122001',
        name: 'Test Migration',
        status: 'completed',
        batch: 5,
      });

      const batch2 = await migrationRunner.getNextBatchNumber();
      expect(batch2).toBe(6);
    });

    it('should create migration file', async () => {
      const result = await migrationRunner.createMigration('Test Migration');

      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('path');
      expect(result.filename).toMatch(/^\d+-test-migration\.js$/);
    });
  });

  describe('Migration Locking', () => {
    it('should acquire lock', async () => {
      const lock = await migrationRunner.acquireLock('Test lock');

      expect(lock).toBeDefined();
      expect(lock.locked).toBe(true);
      expect(lock.reason).toBe('Test lock');

      // Clean up
      await migrationRunner.releaseLock();
    });

    it('should prevent concurrent locks', async () => {
      await migrationRunner.acquireLock('First lock');

      try {
        const runner2 = Object.create(Object.getPrototypeOf(migrationRunner));
        runner2.lockId = 'different-id';

        await expect(runner2.acquireLock('Second lock')).rejects.toThrow();
      } finally {
        await migrationRunner.releaseLock();
      }
    });

    it('should release lock', async () => {
      await migrationRunner.acquireLock('Test lock');

      let lockStatus = await MigrationLock.findOne({ locked: true });
      expect(lockStatus).toBeDefined();

      await migrationRunner.releaseLock();

      lockStatus = await MigrationLock.findOne({ locked: true });
      expect(lockStatus).toBeNull();
    });

    it('should get lock status', async () => {
      const noLock = await migrationRunner.getLockStatus();
      expect(noLock).toBeNull();

      await migrationRunner.acquireLock('Test lock');

      const lock = await migrationRunner.getLockStatus();
      expect(lock).toBeDefined();
      expect(lock.locked).toBe(true);

      await migrationRunner.releaseLock();
    });

    it('should force release lock', async () => {
      await migrationRunner.acquireLock('Test lock');

      let lock = await MigrationLock.findOne({ locked: true });
      expect(lock).toBeDefined();

      await migrationRunner.forceReleaseLock();

      lock = await MigrationLock.findOne({ locked: true });
      expect(lock).toBeNull();
    });
  });

  describe('Migration Tracking', () => {
    it('should track applied migration', async () => {
      const migration = await Migration.create({
        version: '20250122001',
        name: 'Test Migration',
        status: 'completed',
        appliedAt: new Date(),
        executionTime: 100,
        reversible: true,
      });

      const found = await Migration.findOne({ version: '20250122001' });
      expect(found).toBeDefined();
      expect(found.name).toBe('Test Migration');
      expect(found.status).toBe('completed');
    });

    it('should track failed migration', async () => {
      await Migration.create({
        version: '20250122002',
        name: 'Failed Migration',
        status: 'failed',
        error: 'Connection timeout',
        executionTime: 500,
      });

      const failed = await Migration.findOne({ version: '20250122002' });
      expect(failed).toBeDefined();
      expect(failed.status).toBe('failed');
      expect(failed.error).toBe('Connection timeout');
    });

    it('should track rolled back migration', async () => {
      const migration = await Migration.create({
        version: '20250122003',
        name: 'Rolled Back Migration',
        status: 'rolled-back',
        appliedAt: new Date(),
        rolledBackAt: new Date(),
        reversible: true,
      });

      const found = await Migration.findOne({ version: '20250122003' });
      expect(found).toBeDefined();
      expect(found.status).toBe('rolled-back');
      expect(found.rolledBackAt).toBeDefined();
    });

    it('should query migration history', async () => {
      // Create multiple migrations
      await Migration.create([
        {
          version: '20250122001',
          name: 'Migration 1',
          status: 'completed',
        },
        {
          version: '20250122002',
          name: 'Migration 2',
          status: 'completed',
        },
        {
          version: '20250122003',
          name: 'Migration 3',
          status: 'failed',
        },
      ]);

      // Get all
      const all = await Migration.find({});
      expect(all.length).toBe(3);

      // Filter by status
      const completed = await Migration.find({ status: 'completed' });
      expect(completed.length).toBe(2);

      const failed = await Migration.find({ status: 'failed' });
      expect(failed.length).toBe(1);
    });
  });

  describe('Status Reporting', () => {
    it('should report correct summary statistics', async () => {
      // Create some test migrations
      await Migration.create([
        {
          version: '20250122001',
          name: 'Migration 1',
          status: 'completed',
        },
        {
          version: '20250122002',
          name: 'Migration 2',
          status: 'completed',
        },
        {
          version: '20250122003',
          name: 'Migration 3',
          status: 'failed',
        },
      ]);

      const status = await migrationRunner.getStatus();

      expect(status.summary.applied).toBe(2);
      expect(status.summary.failed).toBe(1);
      expect(status.failed.length).toBe(1);
    });

    it('should report applied migrations in reverse order', async () => {
      const now = new Date();
      await Migration.create([
        {
          version: '20250122001',
          name: 'Migration 1',
          status: 'completed',
          appliedAt: new Date(now.getTime() - 2000),
        },
        {
          version: '20250122002',
          name: 'Migration 2',
          status: 'completed',
          appliedAt: new Date(now.getTime() - 1000),
        },
        {
          version: '20250122003',
          name: 'Migration 3',
          status: 'completed',
          appliedAt: new Date(now.getTime()),
        },
      ]);

      const status = await migrationRunner.getStatus();

      expect(status.applied[0].version).toBe('20250122003');
      expect(status.applied[1].version).toBe('20250122002');
      expect(status.applied[2].version).toBe('20250122001');
    });
  });

  describe('Migration Dry Run', () => {
    it('should support dry-run option for up migrations', async () => {
      const result = await migrationRunner.runUp({ dryRun: true });

      // Should not fail even with dry-run
      expect(result).toHaveProperty('success');
      expect(Array.isArray(result.migrations)).toBe(true);
    });

    it('should support dry-run option for down migrations', async () => {
      const result = await migrationRunner.runDown({ dryRun: true });

      expect(result).toHaveProperty('success');
      expect(Array.isArray(result.migrations)).toBe(true);
    });
  });

  describe('Migration Options', () => {
    it('should handle continueOnError option', async () => {
      const result = await migrationRunner.runUp({ continueOnError: true });

      // Should complete without throwing
      expect(result).toBeDefined();
    });

    it('should handle steps option for down', async () => {
      await Migration.create([
        {
          version: '20250122001',
          name: 'Migration 1',
          status: 'completed',
          reversible: true,
        },
        {
          version: '20250122002',
          name: 'Migration 2',
          status: 'completed',
          reversible: true,
        },
      ]);

      // This would normally run down, but we test the option is accepted
      const result = await migrationRunner.runDown({
        steps: 2,
        dryRun: true,
      });

      expect(result).toBeDefined();
    });
  });
});
