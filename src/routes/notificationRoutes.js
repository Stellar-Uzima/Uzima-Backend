import express from 'express';
import {
  sendEmailNotification,
  getNotificationById,
  listNotifications,
  retryFailedNotification,
  getStats,
} from '../controllers/notificationController.js';
import {
  validateSendEmail,
  validateListNotifications,
  validateNotificationId,
} from '../middleware/validateNotification.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Email notification management
 */

// Send email notification
router.post('/email', validateSendEmail, sendEmailNotification);

// Get notifications list
router.get('/email', validateListNotifications, listNotifications);

// Get notification by ID
router.get('/email/:id', validateNotificationId, getNotificationById);

// Retry failed notification
router.post('/email/:id/retry', validateNotificationId, retryFailedNotification);

// Get queue statistics
router.get('/stats', getStats);

export default router;
