import express from 'express';
import { backupDatabase, restoreDatabase } from '../controllers/dbController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { adminRateLimit } from '../middleware/rateLimiter.js';
import { runReconciliationNow } from '../controllers/reconciliation.controller.js';
import redisClient from '../config/redis.js';
import userController from '../controllers/userController.js';
import recordController from '../controllers/recordController.js';
import { verifyAdmin } from '../middleware/auth.js';
import EmailBounce from '../models/EmailBounce.js';

const router = express.Router();

// Existing routes
router.post('/backup', protect, hasPermission('manage_users'), adminRateLimit, backupDatabase);
router.post('/restore', protect, hasPermission('manage_users'), adminRateLimit, restoreDatabase);

/**
 * @swagger
 * /api/admin/reconciliation/run:
 *   post:
 *     summary: Run payment webhook reconciliation
 *     description: Trigger a reconciliation run that matches payment webhooks to local payment records,
 *       identifies orphaned webhooks, missing webhooks, and amount mismatches, and optionally sends an
 *       email report about detected discrepancies.
 *     tags: [Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: provider
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter reconciliation to a specific payment provider (e.g., "stripe"). If omitted, all providers are included.
 *       - in: query
 *         name: since
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Only include payments and webhooks created on or after this timestamp (ISO 8601).
 *       - in: query
 *         name: format
 *         required: false
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Response format. Use `csv` to download a CSV file of discrepancies.
 *       - in: query
 *         name: notify
 *         required: false
 *         schema:
 *           type: boolean
 *         description: When true, sends an email summary if discrepancies are found (requires RECONCILIATION_ALERT_EMAILS).
 *     responses:
 *       200:
 *         description: Reconciliation run completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Reconciliation completed
 *                 data:
 *                   type: object
 *                   properties:
 *                     run:
 *                       type: object
 *                       description: Reconciliation run metadata and summary.
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalPayments:
 *                           type: integer
 *                         totalWebhooks:
 *                           type: integer
 *                         matchedCount:
 *                           type: integer
 *                         orphanedWebhookCount:
 *                           type: integer
 *                         missingWebhookCount:
 *                           type: integer
 *                         amountMismatchCount:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions (admin only)
 */
// Reconciliation run endpoint
router.post(
  '/reconciliation/run',
  protect,
  hasPermission('manage_users'),
  adminRateLimit,
  runReconciliationNow
);
router.post('/cache/clear', verifyAdmin, async (req, res) => {
  await redisClient.flushall();
  res.json({
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString(),
  });
});

// Soft-delete restore endpoints
router.post(
  '/restore/user/:id',
  protect,
  hasPermission('manage_users'),
  userController.restoreUser
);
router.post(
  '/restore/record/:id',
  protect,
  hasPermission('manage_users'),
  recordController.restoreRecord
);

// Permanent purge endpoints
router.delete('/purge/user/:id', protect, hasPermission('manage_users'), userController.purgeUser);
router.delete(
  '/purge/record/:id',
  protect,
  hasPermission('manage_users'),
  recordController.purgeRecord
);

// ============================================
// EMAIL BOUNCE MANAGEMENT ROUTES
// ============================================

// Get all bounces with filtering and pagination
router.get('/email-bounces', protect, hasPermission('manage_users'), async (req, res) => {
  try {
    const {
      type,
      isBlacklisted,
      email,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const query = {};

    if (type) query.type = type;
    if (isBlacklisted !== undefined) query.isBlacklisted = isBlacklisted === 'true';
    if (email) query.email = new RegExp(email, 'i');

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [bounces, total] = await Promise.all([
      EmailBounce.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      EmailBounce.countDocuments(query),
    ]);

    res.json({
      success: true,
      bounces,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching bounces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bounce records',
    });
  }
});

// Get bounce statistics
router.get('/email-bounces/stats', protect, hasPermission('manage_users'), async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const stats = await EmailBounce.getBounceStats(parseInt(hours));

    const [totalBlacklisted, totalBounces] = await Promise.all([
      EmailBounce.countDocuments({ isBlacklisted: true }),
      EmailBounce.countDocuments(),
    ]);

    res.json({
      success: true,
      ...stats,
      totalBlacklisted,
      totalBounces,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bounce statistics',
    });
  }
});

// Get specific bounce record
router.get('/email-bounces/:email', protect, hasPermission('manage_users'), async (req, res) => {
  try {
    const { email } = req.params;

    const bounce = await EmailBounce.findOne({
      email: email.toLowerCase(),
    });

    if (!bounce) {
      return res.status(404).json({
        success: false,
        error: 'Bounce record not found',
      });
    }

    res.json({
      success: true,
      bounce,
    });
  } catch (error) {
    console.error('Error fetching bounce:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bounce record',
    });
  }
});

// Update bounce record (e.g., remove from blacklist)
router.patch('/email-bounces/:email', protect, hasPermission('manage_users'), async (req, res) => {
  try {
    const { email } = req.params;
    const { isBlacklisted } = req.body;

    const bounce = await EmailBounce.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isBlacklisted },
      { new: true }
    );

    if (!bounce) {
      return res.status(404).json({
        success: false,
        error: 'Bounce record not found',
      });
    }

    res.json({
      success: true,
      message: 'Bounce record updated successfully',
      bounce,
    });
  } catch (error) {
    console.error('Error updating bounce:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bounce record',
    });
  }
});

// Remove email from bounce list (permanent delete)
router.delete('/email-bounces/:email', protect, hasPermission('manage_users'), async (req, res) => {
  try {
    const { email } = req.params;

    const result = await EmailBounce.findOneAndDelete({
      email: email.toLowerCase(),
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Bounce record not found',
      });
    }

    res.json({
      success: true,
      message: 'Bounce record removed successfully',
      email,
    });
  } catch (error) {
    console.error('Error removing bounce:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove bounce record',
    });
  }
});

// Bulk remove bounces (useful for cleaning up soft bounces)
router.post(
  '/email-bounces/bulk-delete',
  protect,
  hasPermission('manage_users'),
  async (req, res) => {
    try {
      const { emails, type } = req.body;

      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid emails array',
        });
      }

      const query = {
        email: { $in: emails.map(e => e.toLowerCase()) },
      };

      if (type) {
        query.type = type;
      }

      const result = await EmailBounce.deleteMany(query);

      res.json({
        success: true,
        message: `${result.deletedCount} bounce records removed successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error('Error bulk deleting bounces:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove bounce records',
      });
    }
  }
);

export default router;
