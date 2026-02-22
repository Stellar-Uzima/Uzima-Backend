import express from 'express';
import { 
  getNotificationQueueStats, 
  pauseQueues, 
  resumeQueues,
  enqueueEmailNotification,
  enqueuePushNotification 
} from '../workers/notificationWorker.js';
import { auth } from '../middleware/authMiddleware.js';
import { requireRoles } from '../middleware/requireRole.js';
import { logger } from '../utils/logger.js';
import Notification from '../models/Notification.js';

const router = express.Router();

/**
 * @swagger
 * /api/admin/notifications/queues/stats:
 *   get:
 *     summary: Get notification queue statistics
 *     tags: [Notifications, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue statistics retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/stats', auth, requireRoles(['admin']), async (req, res) => {
  try {
    const stats = await getNotificationQueueStats();
    
    logger.info('Queue stats retrieved', {
      userId: req.user.id,
      stats,
    });

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get queue stats', {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve queue statistics',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/admin/notifications/queues/pause:
 *   post:
 *     summary: Pause notification queues
 *     tags: [Notifications, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queues paused successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/pause', auth, requireRoles(['admin']), async (req, res) => {
  try {
    await pauseQueues();
    
    logger.info('Notification queues paused', {
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: 'Notification queues paused successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to pause queues', {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to pause notification queues',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/admin/notifications/queues/resume:
 *   post:
 *     summary: Resume notification queues
 *     tags: [Notifications, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queues resumed successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/resume', auth, requireRoles(['admin']), async (req, res) => {
  try {
    await resumeQueues();
    
    logger.info('Notification queues resumed', {
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: 'Notification queues resumed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to resume queues', {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to resume notification queues',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/admin/notifications/queues/health:
 *   get:
 *     summary: Get notification worker health status
 *     tags: [Notifications, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Worker health status retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/health', auth, requireRoles(['admin']), async (req, res) => {
  try {
    // Get queue statistics
    const queueStats = await getNotificationQueueStats();
    
    // Get recent notification statistics
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentStats = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: oneHourAgo }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate health metrics
    const totalRecent = recentStats.reduce((sum, stat) => sum + stat.count, 0);
    const successRate = recentStats.find(s => s._id === 'sent')?.count || 0;
    const failureRate = recentStats.find(s => s._id === 'failed')?.count || 0;
    const healthPercentage = totalRecent > 0 ? (successRate / totalRecent) * 100 : 100;

    const healthStatus = {
      status: healthPercentage >= 95 ? 'healthy' : healthPercentage >= 80 ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      metrics: {
        successRate: Math.round(healthPercentage * 100) / 100,
        totalProcessed: totalRecent,
        successful: successRate,
        failed: failureRate,
        pending: recentStats.find(s => s._id === 'pending')?.count || 0,
      },
      queues: queueStats,
      uptime: process.uptime(),
    };

    logger.info('Worker health status retrieved', {
      userId: req.user.id,
      healthStatus,
    });

    res.json({
      success: true,
      data: healthStatus,
    });
  } catch (error) {
    logger.error('Failed to get worker health', {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve worker health status',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/admin/notifications/queues/test-email:
 *   post:
 *     summary: Queue a test email notification
 *     tags: [Notifications, Admin]
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
 *             properties:
 *               to:
 *                 type: string
 *                 description: Recipient email address
 *               subject:
 *                 type: string
 *                 description: Email subject
 *               message:
 *                 type: string
 *                 description: Email message (HTML)
 *               priority:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 5
 *                 description: Job priority
 *     responses:
 *       200:
 *         description: Test email queued successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/test-email', auth, requireRoles(['admin']), async (req, res) => {
  try {
    const { to, subject, message, priority = 5 } = req.body;

    if (!to || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject',
      });
    }

    // Create a test notification record
    const testNotification = new Notification({
      type: 'test_email',
      userId: req.user.id,
      channel: 'email',
      recipient: { email: to, userId: req.user.id },
      subject: `[TEST] ${subject}`,
      content: {
        html: message || `<p>This is a test email from the notification worker.</p>`,
        text: `This is a test email from the notification worker.`,
      },
      status: 'pending',
      provider: 'test',
    });

    await testNotification.save();

    // Queue the email
    await enqueueEmailNotification({
      notificationId: testNotification._id.toString(),
      to,
      subject: `[TEST] ${subject}`,
      html: message || `<p>This is a test email from the notification worker.</p>`,
      text: `This is a test email from the notification worker.`,
      type: 'test_email',
      userId: req.user.id,
    }, priority);

    logger.info('Test email queued', {
      userId: req.user.id,
      to,
      subject,
      notificationId: testNotification._id,
    });

    res.json({
      success: true,
      message: 'Test email queued successfully',
      data: {
        notificationId: testNotification._id,
        to,
        subject,
        priority,
      },
    });
  } catch (error) {
    logger.error('Failed to queue test email', {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to queue test email',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/admin/notifications/queues/test-push:
 *   post:
 *     summary: Queue a test push notification
 *     tags: [Notifications, Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Target user ID
 *               title:
 *                 type: string
 *                 description: Push notification title
 *               message:
 *                 type: string
 *                 description: Push notification message
 *               priority:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 5
 *                 description: Job priority
 *     responses:
 *       200:
 *         description: Test push notification queued successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/test-push', auth, requireRoles(['admin']), async (req, res) => {
  try {
    const { userId, title, message, priority = 5 } = req.body;

    if (!userId || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, title',
      });
    }

    // Create a test notification record
    const testNotification = new Notification({
      type: 'test_push',
      userId: userId,
      channel: 'push',
      recipient: { userId },
      subject: `[TEST] ${title}`,
      content: {
        text: message || 'This is a test push notification from the notification worker.',
      },
      status: 'pending',
      provider: 'test',
    });

    await testNotification.save();

    // Queue the push notification
    await enqueuePushNotification({
      notificationId: testNotification._id.toString(),
      userId,
      title: `[TEST] ${title}`,
      message: message || 'This is a test push notification from the notification worker.',
      data: { type: 'test', timestamp: new Date().toISOString() },
    }, priority);

    logger.info('Test push notification queued', {
      adminUserId: req.user.id,
      targetUserId: userId,
      title,
      notificationId: testNotification._id,
    });

    res.json({
      success: true,
      message: 'Test push notification queued successfully',
      data: {
        notificationId: testNotification._id,
        userId,
        title,
        priority,
      },
    });
  } catch (error) {
    logger.error('Failed to queue test push notification', {
      adminUserId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to queue test push notification',
      message: error.message,
    });
  }
});

export default router;
