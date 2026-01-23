import express from 'express';
import {
  getStatus,
  runMigrationsUp,
  runMigrationsDown,
  createMigration,
  getMigrationHistory,
  getLockStatus,
  forceReleaseLock,
} from '../controllers/migrationController.js';

const router = express.Router();

/**
 * Get migration status
 * GET /api/migrations/status
 */
router.get('/status', getStatus);

/**
 * Get migration history
 * GET /api/migrations/history
 */
router.get('/history', getMigrationHistory);

/**
 * Run pending migrations (up)
 * POST /api/migrations/up
 * Query params: dryRun=true/false, continueOnError=true/false
 */
router.post('/up', runMigrationsUp);

/**
 * Rollback migrations (down)
 * POST /api/migrations/down
 * Query params: steps=number, dryRun=true/false, continueOnError=true/false
 */
router.post('/down', runMigrationsDown);

/**
 * Create new migration
 * POST /api/migrations
 * Body: { name: string }
 */
router.post('/', createMigration);

/**
 * Get lock status
 * GET /api/migrations/lock/status
 */
router.get('/lock/status', getLockStatus);

/**
 * Force release lock (admin only)
 * POST /api/migrations/lock/release
 */
router.post('/lock/release', forceReleaseLock);

export default router;
