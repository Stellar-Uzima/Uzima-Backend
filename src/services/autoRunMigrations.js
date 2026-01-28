import migrationRunner from '../services/migrationRunner.js';

/**
 * Auto-run pending migrations on application startup
 * Can be controlled via environment variable MIGRATE_ON_START
 */
export async function autoRunMigrations(options = {}) {
  const { force = false, continueOnError = false } = options;
  const shouldAutoRun = process.env.MIGRATE_ON_START === 'true' || force;

  if (!shouldAutoRun) {
    return { skipped: true, reason: 'Auto-run disabled' };
  }

  try {
    console.log('🚀 Auto-running pending migrations...');

    // Check if migrations are locked
    const lock = await migrationRunner.getLockStatus();
    if (lock) {
      console.warn(`⚠️  Migrations are locked by ${lock.lockedBy}. Reason: ${lock.reason}`);
      return { skipped: true, reason: 'Migrations locked' };
    }

    // Run pending migrations
    const result = await migrationRunner.runUp({
      dryRun: false,
      continueOnError,
    });

    if (result.migrations.length === 0) {
      console.log('✓ No pending migrations');
      return { success: true, migrations: [] };
    }

    const successful = result.migrations.filter(m => m.status === 'completed').length;
    const failed = result.migrations.filter(m => m.status === 'failed').length;

    console.log(`✓ Auto-run completed: ${successful} successful, ${failed} failed`);

    return result;
  } catch (error) {
    console.error('✗ Auto-run migration failed:', error.message);

    if (process.env.MIGRATE_ON_START_FAIL_HARD === 'true') {
      throw error;
    }

    return { success: false, error: error.message };
  }
}

/**
 * Wrapper to add auto-run to Express application startup
 */
export function setupAutoRun(app) {
  const originalListen = app.listen;

  app.listen = function (...args) {
    const callback = args[args.length - 1];

    const wrappedCallback = async () => {
      try {
        await autoRunMigrations();
        if (typeof callback === 'function') {
          callback();
        }
      } catch (error) {
        console.error('Fatal: Auto-run migration failed', error);
        process.exit(1);
      }
    };

    // Replace the callback with our wrapped version
    args[args.length - 1] = wrappedCallback;
    return originalListen.apply(this, args);
  };

  return app;
}

export default {
  autoRunMigrations,
  setupAutoRun,
};
