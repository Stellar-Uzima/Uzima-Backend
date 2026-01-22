import express from 'express';
import { backupDatabase, restoreDatabase } from '../controllers/dbController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import { adminRateLimit } from '../middleware/rateLimiter.js';
import { runReconciliationNow } from '../controllers/reconciliation.controller.js';

const router = express.Router();


// Protect and restrict to admin with rate limiting
router.post('/backup', protect, hasPermission('manage_users'), adminRateLimit, backupDatabase);
router.post('/restore', protect, hasPermission('manage_users'), adminRateLimit, ...restoreDatabase);

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

// Soft-delete restore endpoints
import userController from '../controllers/userController.js';
import recordController from '../controllers/recordController.js';

router.post('/restore/user/:id', protect, hasPermission('manage_users'), userController.restoreUser);
router.post('/restore/record/:id', protect, hasPermission('manage_users'), recordController.restoreRecord);

// Permanent purge endpoints
router.delete('/purge/user/:id', protect, hasPermission('manage_users'), userController.purgeUser);
router.delete('/purge/record/:id', protect, hasPermission('manage_users'), recordController.purgeRecord);


export default router;
