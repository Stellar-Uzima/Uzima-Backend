import express from 'express';
import { 
  triggerManualBackup,
  triggerManualCleanup,
  getBackupStats,
  testBackupHealth,
  listRecentBackups
} from '../controllers/dailyBackupController.js';
import auth from '../middleware/authMiddleware.js';
import requireRole from '../middleware/requireRole.js';

const router = express.Router();

// All backup routes require authentication and admin role
router.use(auth);
router.use(requireRole(['admin']));

/**
 * @route POST /api/backups/manual
 * @desc Trigger manual daily backup
 * @access Admin
 */
router.post('/manual', triggerManualBackup);

/**
 * @route POST /api/backups/cleanup
 * @desc Trigger manual cleanup of old backups
 * @access Admin
 */
router.post('/cleanup', triggerManualCleanup);

/**
 * @route GET /api/backups/stats
 * @desc Get backup statistics
 * @access Admin
 */
router.get('/stats', getBackupStats);

/**
 * @route GET /api/backups/health
 * @desc Test backup system health
 * @access Admin
 */
router.get('/health', testBackupHealth);

/**
 * @route GET /api/backups/list
 * @desc List recent backups
 * @access Admin
 */
router.get('/list', listRecentBackups);

export default router;