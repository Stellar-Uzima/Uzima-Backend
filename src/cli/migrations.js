import { Command } from 'commander';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import migrationRunner from '../services/migrationRunner.js';

dotenv.config();

const program = new Command();

// Connect to MongoDB before running any command
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/uzima', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

// Disconnect from MongoDB after command execution
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  } catch (error) {
    console.error('Warning: Error disconnecting from MongoDB:', error.message);
  }
}

/**
 * Migrate up command - Run pending migrations
 */
program
  .command('migrate:up')
  .description('Run pending migrations')
  .option('--dry-run', 'Simulate migration without applying changes')
  .option('--continue-on-error', 'Continue running remaining migrations even if one fails')
  .action(async options => {
    try {
      await connectDB();
      console.log('\n🚀 Running migrations...\n');

      const result = await migrationRunner.runUp({
        dryRun: options.dryRun || false,
        continueOnError: options.continueOnError || false,
      });

      if (result.migrations.length === 0) {
        console.log('ℹ No pending migrations to run');
      } else {
        console.log(`\n✓ Migration run completed`);
        console.log(`  Total: ${result.migrations.length}`);
        console.log(
          `  Successful: ${result.migrations.filter(m => m.status === 'completed').length}`
        );
        console.log(`  Failed: ${result.migrations.filter(m => m.status === 'failed').length}`);
      }

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Migration failed:', error.message);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  });

/**
 * Migrate down command - Rollback migrations
 */
program
  .command('migrate:down')
  .description('Rollback migrations')
  .option('-s, --steps <number>', 'Number of migrations to rollback', '1')
  .option('--dry-run', 'Simulate rollback without applying changes')
  .option('--continue-on-error', 'Continue rolling back remaining migrations even if one fails')
  .action(async options => {
    try {
      await connectDB();
      console.log('\n↻ Rolling back migrations...\n');

      const result = await migrationRunner.runDown({
        steps: parseInt(options.steps),
        dryRun: options.dryRun || false,
        continueOnError: options.continueOnError || false,
      });

      if (result.migrations.length === 0) {
        console.log('ℹ No migrations to rollback');
      } else {
        console.log(`\n✓ Rollback completed`);
        console.log(`  Total: ${result.migrations.length}`);
        console.log(
          `  Successful: ${result.migrations.filter(m => m.status === 'rolled-back').length}`
        );
        console.log(`  Failed: ${result.migrations.filter(m => m.status === 'failed').length}`);
      }

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Rollback failed:', error.message);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  });

/**
 * Status command - Show migration status
 */
program
  .command('migrate:status')
  .description('Show migration status')
  .action(async () => {
    try {
      await connectDB();
      console.log('\n📊 Migration Status\n');

      const status = await migrationRunner.getStatus();

      // Applied migrations
      console.log('✓ Applied Migrations:');
      if (status.applied.length === 0) {
        console.log('  (none)');
      } else {
        status.applied.forEach(m => {
          console.log(`  - ${m.version}: ${m.name}`);
          if (m.appliedAt) {
            console.log(`    Applied: ${m.appliedAt.toISOString()}`);
          }
          if (m.executionTime) {
            console.log(`    Time: ${m.executionTime}ms`);
          }
        });
      }

      // Pending migrations
      console.log('\n⏳ Pending Migrations:');
      if (status.pending.length === 0) {
        console.log('  (none)');
      } else {
        status.pending.forEach(m => {
          console.log(`  - ${m.version}: ${m.name}`);
          console.log(`    Reversible: ${m.reversible ? 'Yes' : 'No'}`);
        });
      }

      // Failed migrations
      if (status.failed.length > 0) {
        console.log('\n✗ Failed Migrations:');
        status.failed.forEach(m => {
          console.log(`  - ${m.version}: ${m.name}`);
          console.log(`    Error: ${m.error}`);
        });
      }

      // Summary
      console.log('\n📈 Summary:');
      console.log(`  Total: ${status.summary.total}`);
      console.log(`  Applied: ${status.summary.applied}`);
      console.log(`  Pending: ${status.summary.pending}`);
      console.log(`  Failed: ${status.summary.failed}`);

      // Lock status
      if (status.locked) {
        console.log('\n🔒 Lock Status:');
        console.log(`  Locked by: ${status.locked.lockedBy}`);
        console.log(`  Reason: ${status.locked.reason}`);
      }

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error getting status:', error.message);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  });

/**
 * Create command - Create a new migration file
 */
program
  .command('migrate:create <name>')
  .description('Create a new migration file')
  .action(async name => {
    try {
      await connectDB();
      console.log('\n📝 Creating new migration...\n');

      const result = await migrationRunner.createMigration(name);
      console.log(`✓ Migration created: ${result.filename}`);
      console.log(`  Path: ${result.path}`);

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error creating migration:', error.message);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  });

/**
 * Lock status command
 */
program
  .command('migrate:lock-status')
  .description('Check migration lock status')
  .action(async () => {
    try {
      await connectDB();
      const lock = await migrationRunner.getLockStatus();

      if (lock) {
        console.log('\n🔒 Migration Lock Status\n');
        console.log(`Status: LOCKED`);
        console.log(`Locked by: ${lock.lockedBy}`);
        console.log(`Reason: ${lock.reason}`);
        console.log(`Acquired at: ${lock.lockedAt.toISOString()}`);
        console.log(`Expires at: ${lock.expiresAt.toISOString()}`);
      } else {
        console.log('\n🔓 Migration Lock Status\n');
        console.log('Status: UNLOCKED');
      }

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error getting lock status:', error.message);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  });

/**
 * Force unlock command (admin only)
 */
program
  .command('migrate:force-unlock')
  .description('Force release migration lock (use with caution!)')
  .option('--confirm', 'Confirm the force unlock')
  .action(async options => {
    try {
      if (!options.confirm) {
        console.log('\n⚠️  Warning: This will force release the migration lock!');
        console.log('Use --confirm flag to proceed.');
        process.exit(1);
      }

      await connectDB();
      console.log('\n🔓 Force releasing migration lock...\n');

      await migrationRunner.forceReleaseLock();
      console.log('✓ Migration lock released');

      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error releasing lock:', error.message);
      process.exit(1);
    } finally {
      await disconnectDB();
    }
  });

// Parse command line arguments
program.version('1.0.0').description('Database Migration CLI Tool').parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

export default program;
