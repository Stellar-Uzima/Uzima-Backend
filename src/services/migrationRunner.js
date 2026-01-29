import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Migration from '../models/Migration.js';
import MigrationLock from '../models/MigrationLock.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const LOCK_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

class MigrationRunner {
  constructor() {
    this.lockId = uuidv4();
    this.lockInterval = null;
  }

  /**
   * Acquire migration lock to prevent concurrent migrations
   */
  async acquireLock(reason = 'Running migrations') {
    try {
      // Try to acquire lock
      const lock = await MigrationLock.findOneAndUpdate(
        { locked: false },
        {
          locked: true,
          lockedAt: new Date(),
          lockedBy: this.lockId,
          reason,
          expiresAt: new Date(Date.now() + LOCK_TIMEOUT),
        },
        { upsert: true, new: true }
      );

      if (lock.lockedBy !== this.lockId) {
        throw new Error(
          `Migration lock is held by ${lock.lockedBy}. Reason: ${lock.reason}`
        );
      }

      // Refresh lock periodically
      this.lockInterval = setInterval(async () => {
        try {
          await MigrationLock.updateOne(
            { lockedBy: this.lockId },
            {
              expiresAt: new Date(Date.now() + LOCK_TIMEOUT),
              lockedAt: new Date(),
            }
          );
        } catch (error) {
          console.error('Error refreshing migration lock:', error);
        }
      }, LOCK_REFRESH_INTERVAL);

      return lock;
    } catch (error) {
      throw new Error(`Failed to acquire migration lock: ${error.message}`);
    }
  }

  /**
   * Release migration lock
   */
  async releaseLock() {
    try {
      if (this.lockInterval) {
        clearInterval(this.lockInterval);
      }
      await MigrationLock.updateOne(
        { lockedBy: this.lockId },
        { locked: false, lockedBy: null }
      );
    } catch (error) {
      console.error('Error releasing migration lock:', error);
    }
  }

  /**
   * Get all migration files from migrations directory
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(MIGRATIONS_DIR);
      return files
        .filter(
          (file) =>
            file.endsWith('.js') && /^\d+/.test(file) // Numbered files
        )
        .sort();
    } catch (error) {
      // Create migrations directory if it doesn't exist
      if (error.code === 'ENOENT') {
        await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
        return [];
      }
      throw error;
    }
  }

  /**
   * Load a migration file
   */
  async loadMigration(filename) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    try {
      const module = await import(`file://${filePath}`);
      return module.default || module;
    } catch (error) {
      throw new Error(`Failed to load migration ${filename}: ${error.message}`);
    }
  }

  /**
   * Extract version number from filename
   */
  extractVersion(filename) {
    const match = filename.match(/^(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Get all pending migrations
   */
  async getPendingMigrations() {
    const files = await this.getMigrationFiles();
    const applied = await Migration.find({ status: 'completed' });
    const appliedVersions = new Set(applied.map((m) => m.version));

    const pending = [];
    for (const file of files) {
      const version = this.extractVersion(file);
      if (version && !appliedVersions.has(version)) {
        const migration = await this.loadMigration(file);
        pending.push({
          file,
          version,
          name: migration.name || file,
          description: migration.description || '',
          reversible: migration.down !== undefined,
        });
      }
    }

    return pending;
  }

  /**
   * Get migration status
   */
  async getStatus() {
    const pending = await this.getPendingMigrations();
    const applied = await Migration.find({ status: 'completed' }).sort({
      appliedAt: -1,
    });
    const failed = await Migration.find({ status: 'failed' });
    const lock = await MigrationLock.findOne({ locked: true });

    return {
      applied: applied.map((m) => ({
        version: m.version,
        name: m.name,
        appliedAt: m.appliedAt,
        executionTime: m.executionTime,
        reversible: m.reversible,
      })),
      pending: pending.map((m) => ({
        version: m.version,
        name: m.name,
        reversible: m.reversible,
      })),
      failed: failed.map((m) => ({
        version: m.version,
        name: m.name,
        error: m.error,
      })),
      locked: lock ? { lockedBy: lock.lockedBy, reason: lock.reason } : null,
      summary: {
        total: applied.length + pending.length,
        applied: applied.length,
        pending: pending.length,
        failed: failed.length,
      },
    };
  }

  /**
   * Run pending migrations
   */
  async runUp(options = {}) {
    const { dryRun = false, batch: batchNumber } = options;

    await this.acquireLock('Running up migrations');

    try {
      const pending = await this.getPendingMigrations();

      if (pending.length === 0) {
        console.log('No pending migrations');
        return { success: true, migrations: [] };
      }

      const results = [];
      let currentBatch = batchNumber || (await this.getNextBatchNumber());

      for (const pend of pending) {
        const startTime = Date.now();
        const migrationRecord = new Migration({
          version: pend.version,
          name: pend.name,
          description: pend.description,
          status: 'running',
          batch: currentBatch,
          reversible: pend.reversible,
        });

        try {
          const migration = await this.loadMigration(pend.file);

          if (dryRun) {
            console.log(`[DRY RUN] Would apply migration: ${pend.name}`);
            results.push({
              version: pend.version,
              name: pend.name,
              status: 'dry-run',
            });
          } else {
            // Run migration within transaction if available
            if (migration.up) {
              await migration.up();
            }

            const executionTime = Date.now() - startTime;
            migrationRecord.status = 'completed';
            migrationRecord.appliedAt = new Date();
            migrationRecord.executionTime = executionTime;
            await migrationRecord.save();

            console.log(
              `✓ Applied migration: ${pend.name} (${executionTime}ms)`
            );
            results.push({
              version: pend.version,
              name: pend.name,
              status: 'completed',
              executionTime,
            });
          }
        } catch (error) {
          const executionTime = Date.now() - startTime;
          migrationRecord.status = 'failed';
          migrationRecord.error = error.message;
          migrationRecord.executionTime = executionTime;
          await migrationRecord.save();

          console.error(
            `✗ Failed migration: ${pend.name} - ${error.message}`
          );
          results.push({
            version: pend.version,
            name: pend.name,
            status: 'failed',
            error: error.message,
            executionTime,
          });

          // Stop on first failure unless continuing is specified
          if (!options.continueOnError) {
            throw new Error(
              `Migration ${pend.name} failed. Stopped execution.`
            );
          }
        }
      }

      return { success: true, migrations: results };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Rollback migrations
   */
  async runDown(options = {}) {
    const { dryRun = false, steps = 1 } = options;

    await this.acquireLock('Running down migrations');

    try {
      // Get applied migrations in reverse order
      const applied = await Migration.find({ status: 'completed' })
        .sort({ appliedAt: -1 })
        .limit(steps);

      if (applied.length === 0) {
        console.log('No migrations to rollback');
        return { success: true, migrations: [] };
      }

      const results = [];

      for (const migration of applied) {
        if (!migration.reversible) {
          console.warn(
            `⚠ Skipping non-reversible migration: ${migration.name}`
          );
          results.push({
            version: migration.version,
            name: migration.name,
            status: 'skipped',
            reason: 'Non-reversible',
          });
          continue;
        }

        const startTime = Date.now();

        try {
          const migrationFile = await this.findMigrationFile(
            migration.version
          );
          if (!migrationFile) {
            throw new Error(`Migration file not found for version ${migration.version}`);
          }

          const migrationModule = await this.loadMigration(migrationFile);

          if (dryRun) {
            console.log(`[DRY RUN] Would rollback migration: ${migration.name}`);
            results.push({
              version: migration.version,
              name: migration.name,
              status: 'dry-run',
            });
          } else {
            if (migrationModule.down) {
              await migrationModule.down();
            }

            const executionTime = Date.now() - startTime;
            await Migration.updateOne(
              { _id: migration._id },
              {
                status: 'rolled-back',
                rolledBackAt: new Date(),
                executionTime,
              }
            );

            console.log(
              `↻ Rolled back migration: ${migration.name} (${executionTime}ms)`
            );
            results.push({
              version: migration.version,
              name: migration.name,
              status: 'rolled-back',
              executionTime,
            });
          }
        } catch (error) {
          const executionTime = Date.now() - startTime;
          await Migration.updateOne(
            { _id: migration._id },
            {
              status: 'failed',
              error: `Rollback failed: ${error.message}`,
              executionTime,
            }
          );

          console.error(
            `✗ Failed rollback: ${migration.name} - ${error.message}`
          );
          results.push({
            version: migration.version,
            name: migration.name,
            status: 'failed',
            error: error.message,
            executionTime,
          });

          if (!options.continueOnError) {
            throw new Error(`Rollback of ${migration.name} failed.`);
          }
        }
      }

      return { success: true, migrations: results };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Find migration file by version number
   */
  async findMigrationFile(version) {
    const files = await this.getMigrationFiles();
    return files.find((f) => f.startsWith(version));
  }

  /**
   * Get next batch number for migrations
   */
  async getNextBatchNumber() {
    const lastBatch = await Migration.findOne().sort({ batch: -1 });
    return (lastBatch?.batch || 0) + 1;
  }

  /**
   * Create a new migration file
   */
  async createMigration(name) {
    const timestamp = Date.now();
    const sanitizedName = name.toLowerCase().replace(/\s+/g, '-');
    const filename = `${timestamp}-${sanitizedName}.js`;
    const filePath = path.join(MIGRATIONS_DIR, filename);

    const template = `/**
 * Migration: ${name}
 * Created at: ${new Date().toISOString()}
 */

/**
 * Up migration - Apply changes
 */
export async function up() {
  // TODO: Implement your migration logic here
  // Use MongoDB operations or Mongoose models
  // Example:
  // const db = require('mongoose').connection.db;
  // await db.collection('users').updateMany({}, { $set: { migrated: true } });
}

/**
 * Down migration - Rollback changes
 * Comment out or delete if this migration is not reversible
 */
export async function down() {
  // TODO: Implement rollback logic here
}

// Metadata
export const name = '${name}';
export const description = 'TODO: Add description for ${name}';
`;

    await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
    await fs.writeFile(filePath, template);

    console.log(`Created migration: ${filename}`);
    return { filename, path: filePath };
  }

  /**
   * Get lock status
   */
  async getLockStatus() {
    return await MigrationLock.findOne({ locked: true });
  }

  /**
   * Force release lock (use with caution)
   */
  async forceReleaseLock() {
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
    }
    await MigrationLock.updateOne({}, { locked: false, lockedBy: null });
  }
}

export default new MigrationRunner();
