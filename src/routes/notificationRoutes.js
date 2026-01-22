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

/**
 * @swagger
 * /api/notify/email:
 *   post:
 *     summary: Send email notification
 *     description: Send an email notification to a recipient
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - body
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               subject:
 *                 type: string
 *                 example: "Appointment Reminder"
 *               body:
 *                 type: string
 *                 example: "Your appointment is scheduled for tomorrow at 10:00 AM"
 *               templateId:
 *                 type: string
 *                 description: Optional template ID
 *               templateData:
 *                 type: object
 *                 description: Data to populate template
 *     responses:
 *       200:
 *         description: Email queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     notificationId:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Validation error
 */
// Send email notification
router.post('/email', validateSendEmail, sendEmailNotification);

/**
 * @swagger
 * /api/notify/email:
 *   get:
 *     summary: List notifications
 *     description: Retrieve a list of email notifications with optional filters
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, failed]
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       to:
 *                         type: string
 *                       subject:
 *                         type: string
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
// Get notifications list
router.get('/email', validateListNotifications, listNotifications);

/**
 * @swagger
 * /api/notify/email/{id}:
 *   get:
 *     summary: Get notification by ID
 *     description: Retrieve details of a specific notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification retrieved successfully
 *       404:
 *         description: Notification not found
 */
// Get notification by ID
router.get('/email/:id', validateNotificationId, getNotificationById);

/**
 * @swagger
 * /api/notify/email/{id}/retry:
 *   post:
 *     summary: Retry failed notification
 *     description: Retry sending a failed email notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Retry queued successfully
 *       400:
 *         description: Notification cannot be retried
 *       404:
 *         description: Notification not found
 */
// Retry failed notification
router.post('/email/:id/retry', validateNotificationId, retryFailedNotification);

/**
 * @swagger
 * /api/notify/stats:
 *   get:
 *     summary: Get notification statistics
 *     description: Retrieve queue statistics and notification counts
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: number
 *                     sent:
 *                       type: number
 *                     failed:
 *                       type: number
 *                     queueHealth:
 *                       type: string
 */
// Get queue statistics
router.get('/stats', getStats);

export default router;
