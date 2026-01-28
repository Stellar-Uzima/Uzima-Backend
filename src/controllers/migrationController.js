import migrationRunner from '../services/migrationRunner.js';
import Migration from '../models/Migration.js';

/**
 * Get migration status
 */
export const getStatus = async (req, res) => {
  try {
    const status = await migrationRunner.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting migration status:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Run pending migrations (up)
 */
export const runMigrationsUp = async (req, res) => {
  try {
    const { dryRun = false, continueOnError = false } = req.query;

    const result = await migrationRunner.runUp({
      dryRun: dryRun === 'true',
      continueOnError: continueOnError === 'true',
    });

    res.json(result);
  } catch (error) {
    console.error('Error running migrations:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Rollback migrations (down)
 */
export const runMigrationsDown = async (req, res) => {
  try {
    const { steps = 1, dryRun = false, continueOnError = false } = req.query;

    const result = await migrationRunner.runDown({
      steps: parseInt(steps),
      dryRun: dryRun === 'true',
      continueOnError: continueOnError === 'true',
    });

    res.json(result);
  } catch (error) {
    console.error('Error rolling back migrations:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create a new migration
 */
export const createMigration = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Migration name is required' });
    }

    const result = await migrationRunner.createMigration(name);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating migration:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get migration history
 */
export const getMigrationHistory = async (req, res) => {
  try {
    const { limit = 50, skip = 0, status: statusFilter } = req.query;

    const query = {};
    if (statusFilter) {
      query.status = statusFilter;
    }

    const [migrations, total] = await Promise.all([
      Migration.find(query).sort({ createdAt: -1 }).limit(parseInt(limit)).skip(parseInt(skip)),
      Migration.countDocuments(query),
    ]);

    res.json({
      migrations,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error('Error getting migration history:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get lock status
 */
export const getLockStatus = async (req, res) => {
  try {
    const lock = await migrationRunner.getLockStatus();
    res.json({ locked: !!lock, lock });
  } catch (error) {
    console.error('Error getting lock status:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Force release lock (admin only)
 */
export const forceReleaseLock = async (req, res) => {
  try {
    await migrationRunner.forceReleaseLock();
    res.json({ success: true, message: 'Migration lock released' });
  } catch (error) {
    console.error('Error releasing lock:', error);
    res.status(500).json({ error: error.message });
  }
};
