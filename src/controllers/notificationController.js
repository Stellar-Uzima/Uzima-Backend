import {
  createNotification,
  getNotification,
  getNotifications,
  retryNotification,
} from '../services/notificationService.js';
import { getQueueStats } from '../queues/emailQueue.js';

/**
 * @swagger
 * /api/notify/email:
 *   post:
 *     summary: Send an email notification
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - html
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 description: Recipient email address
 *               subject:
 *                 type: string
 *                 description: Email subject
 *               html:
 *                 type: string
 *                 description: HTML content of the email
 *               text:
 *                 type: string
 *                 description: Plain text content (optional)
 *               type:
 *                 type: string
 *                 enum: [account_activation, password_reset, health_record_update, appointment_reminder, general]
 *                 description: Type of notification
 *               userId:
 *                 type: string
 *                 description: User ID (optional)
 *     responses:
 *       201:
 *         description: Email notification queued successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Server error
 */
export async function sendEmailNotification(req, res) {
  try {
    const { to, subject, html, text, type, userId } = req.body;

    // Validate required fields
    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: to, subject, html',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
      });
    }

    const notification = await createNotification({
      to,
      subject,
      html,
      text,
      type,
      userId,
    });

    res.status(201).json({
      success: true,
      message: 'Email notification queued successfully',
      data: {
        notificationId: notification._id,
        status: notification.status,
        recipient: notification.recipient.email,
        type: notification.type,
        createdAt: notification.createdAt,
      },
    });
  } catch (error) {
    console.error('Error sending email notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue email notification',
      error: error.message,
    });
  }
}

/**
 * @swagger
 * /api/notify/email/{id}:
 *   get:
 *     summary: Get notification by ID
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification details
 *       404:
 *         description: Notification not found
 */
export async function getNotificationById(req, res) {
  try {
    const { id } = req.params;
    const notification = await getNotification(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification',
      error: error.message,
    });
  }
}

/**
 * @swagger
 * /api/notify/email:
 *   get:
 *     summary: Get notifications with filters
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, queued, sent, failed, retrying]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of notifications
 */
export async function listNotifications(req, res) {
  try {
    const { status, type, email, userId, limit, skip } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (email) filters.email = email;
    if (userId) filters.userId = userId;

    const options = {
      limit: parseInt(limit) || 50,
      skip: parseInt(skip) || 0,
    };

    const result = await getNotifications(filters, options);

    res.json({
      success: true,
      data: result.notifications,
      pagination: {
        total: result.total,
        limit: result.limit,
        skip: result.skip,
        hasMore: result.skip + result.notifications.length < result.total,
      },
    });
  } catch (error) {
    console.error('Error listing notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list notifications',
      error: error.message,
    });
  }
}

/**
 * @swagger
 * /api/notify/email/{id}/retry:
 *   post:
 *     summary: Retry a failed notification
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification queued for retry
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Notification not found
 */
export async function retryFailedNotification(req, res) {
  try {
    const { id } = req.params;
    const notification = await retryNotification(id);

    res.json({
      success: true,
      message: 'Notification queued for retry',
      data: {
        notificationId: notification._id,
        status: notification.status,
      },
    });
  } catch (error) {
    console.error('Error retrying notification:', error);
    
    if (error.message === 'Notification not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === 'Only failed notifications can be retried') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to retry notification',
      error: error.message,
    });
  }
}

/**
 * @swagger
 * /api/notify/stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Queue statistics
 */
export async function getStats(req, res) {
  try {
    const stats = await getQueueStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch queue statistics',
      error: error.message,
    });
  }
}

export default {
  sendEmailNotification,
  getNotificationById,
  listNotifications,
  retryFailedNotification,
  getStats,
};
