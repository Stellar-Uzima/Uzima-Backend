import express from 'express';
import { backupDatabase, restoreDatabase } from '../controllers/dbController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { adminRateLimit } from '../middleware/rateLimiter.js';
import redisClient from '../config/redis.js';

const router = express.Router();


// Protect and restrict to admin with rate limiting
router.post('/backup', protect, hasPermission('manage_users'), adminRateLimit, backupDatabase);
router.post('/restore', protect, hasPermission('manage_users'), adminRateLimit, ...restoreDatabase);


router.post("/cache/clear", verifyAdmin, async (req, res) => {
  await redisClient.flushall();
  res.json({
    message: "Cache cleared successfully",
    timestamp: new Date().toISOString(),
  });
});





// Soft-delete restore endpoints
import userController from '../controllers/userController.js';
import recordController from '../controllers/recordController.js';
import redisClient from '../config/redis.js';
import { verifyAdmin } from '../middleware/auth.js';

router.post('/restore/user/:id', protect, hasPermission('manage_users'), userController.restoreUser);
router.post('/restore/record/:id', protect, hasPermission('manage_users'), recordController.restoreRecord);

// Permanent purge endpoints
router.delete('/purge/user/:id', protect, hasPermission('manage_users'), userController.purgeUser);
router.delete('/purge/record/:id', protect, hasPermission('manage_users'), recordController.purgeRecord);


export default router;
