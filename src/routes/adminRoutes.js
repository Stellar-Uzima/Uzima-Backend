import express from 'express';
import { backupDatabase, restoreDatabase } from '../controllers/dbController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { adminRateLimit } from '../middleware/rateLimiter.js';
import cache from '../services/cacheService.js';

const router = express.Router();


// Protect and restrict to admin with rate limiting
router.post('/backup', protect, hasPermission('manage_users'), adminRateLimit, backupDatabase);
router.post('/restore', protect, hasPermission('manage_users'), adminRateLimit, ...restoreDatabase);


// Soft-delete restore endpoints
import userController from '../controllers/userController.js';
import recordController from '../controllers/recordController.js';

router.post('/restore/user/:id', protect, hasPermission('manage_users'), userController.restoreUser);
router.post('/restore/record/:id', protect, hasPermission('manage_users'), recordController.restoreRecord);

// Permanent purge endpoints
router.delete('/purge/user/:id', protect, hasPermission('manage_users'), userController.purgeUser);
router.delete('/purge/record/:id', protect, hasPermission('manage_users'), recordController.purgeRecord);


export default router;

// Admin cache metrics
router.get('/cache/metrics', protect, hasPermission('manage_users'), async (req, res) => {
  const metrics = await cache.metrics();
  res.json({ success: true, data: metrics });
});
