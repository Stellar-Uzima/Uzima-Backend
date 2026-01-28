import express from 'express';
import gdprController from '../controllers/gdprController.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @swagger
 * /api/users/{id}/export-data:
 *   get:
 *     summary: Export user data
 *     description: Export all user-related data in JSON or CSV format for GDPR compliance
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Export format
 *     responses:
 *       200:
 *         description: Export request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     estimatedCompletion:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: User not found
 */
router.get('/:id/export-data', hasPermission('gdpr_export'), gdprController.exportUserData);

/**
 * @swagger
 * /api/users/{id}/export-status/{requestId}:
 *   get:
 *     summary: Get export status
 *     description: Check the status of a data export request
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Export request ID
 *     responses:
 *       200:
 *         description: Export status retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Export request not found
 */
router.get(
  '/:id/export-status/:requestId',
  hasPermission('gdpr_export'),
  gdprController.getExportStatus
);

/**
 * @swagger
 * /api/users/{id}/erase:
 *   delete:
 *     summary: Request user data deletion
 *     description: Request deletion of all user-related data for GDPR compliance
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for deletion request
 *                 default: "User requested data deletion"
 *     responses:
 *       200:
 *         description: Deletion request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     message:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: User not found
 *       409:
 *         description: Deletion request already pending
 */
router.delete('/:id/erase', hasPermission('gdpr_delete'), gdprController.requestUserDeletion);

/**
 * @swagger
 * /api/users/{id}/deletion-status/{requestId}:
 *   get:
 *     summary: Get deletion status
 *     description: Check the status of a data deletion request
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Deletion request ID
 *     responses:
 *       200:
 *         description: Deletion status retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Deletion request not found
 */
router.get(
  '/:id/deletion-status/:requestId',
  hasPermission('gdpr_delete'),
  gdprController.getDeletionStatus
);

export default router;
