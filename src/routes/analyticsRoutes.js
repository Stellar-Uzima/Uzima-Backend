import express from 'express';
import analyticsController from '../controllers/analyticsController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { adminRateLimit } from '../middleware/rateLimiter.js';

const router = express.Router();

// All routes are protected, admin-only, and rate-limited
router.use(protect, hasPermission('manage_users'), adminRateLimit);

// User Analytics
router.get('/users', analyticsController.getUserAnalytics);

// Activity Analytics
router.get('/activity', analyticsController.getActivityAnalytics);

// Performance Analytics
router.get('/performance', analyticsController.getPerformanceAnalytics);

// Error Analytics
router.get('/errors', analyticsController.getErrorAnalytics);

export default router;
