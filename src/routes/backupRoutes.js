import express from 'express';
import {
  getBackups,
  getBackupStatistics,
  getBackupDetails,
  triggerBackup,
  deleteBackup,
  verifyBackup,
  downloadBackup,
} from '../controllers/backupController.js';
import { auth } from '../middleware/authMiddleware.js';
import requireRoles from '../middleware/requireRole.js';
import { createCustomRateLimit } from '../middleware/rateLimiter.js';

const router = express.Router();

// Apply authentication middleware to all backup routes
router.use(auth);

// Apply admin role requirement to all backup routes
router.use(requireRoles(['admin', 'super_admin']));

/**
 * @swagger
 * components:
 *   schemas:
 *     Backup:
 *       type: object
 *       properties:
 *         backupId:
 *           type: string
 *           description: Unique backup identifier
 *         status:
 *           type: string
 *           enum: [pending, in_progress, completed, failed]
 *           description: Current backup status
 *         database:
 *           type: string
 *           description: Database name that was backed up
 *         s3Key:
 *           type: string
 *           description: S3 object key for the backup file
 *         hash:
 *           type: string
 *           description: SHA-256 hash for integrity verification
 *         size:
 *           type: number
 *           description: Backup file size in bytes
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Backup creation timestamp
 *         completedAt:
 *           type: string
 *           format: date-time
 *           description: Backup completion timestamp
 *         verificationStatus:
 *           type: object
 *           properties:
 *             verified:
 *               type: boolean
 *             verifiedAt:
 *               type: string
 *               format: date-time
 */

/**
 * @swagger
 * /api/admin/backups:
 *   get:
 *     summary: Get list of all backups
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, failed]
 *         description: Filter by backup status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Backups retrieved successfully
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
 *                     backups:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Backup'
 *                     pagination:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', getBackups);

/**
 * @swagger
 * /api/admin/backups/stats:
 *   get:
 *     summary: Get backup statistics
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup statistics retrieved successfully
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
 *                     statusCounts:
 *                       type: array
 *                     recentBackups:
 *                       type: array
 *                     totalBackups:
 *                       type: number
 *                     storageUsed:
 *                       type: number
 *                     averageBackupSize:
 *                       type: number
 *                     successRate:
 *                       type: number
 *                     lastBackupTime:
 *                       type: string
 *                       format: date-time
 */
router.get('/stats', getBackupStatistics);

/**
 * @swagger
 * /api/admin/backups/trigger:
 *   post:
 *     summary: Trigger manual backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Backup triggered successfully
 *       409:
 *         description: Backup already in progress
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.post('/trigger', createCustomRateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), triggerBackup);

/**
 * @swagger
 * /api/admin/backups/{backupId}:
 *   get:
 *     summary: Get specific backup details
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup ID
 *     responses:
 *       200:
 *         description: Backup details retrieved successfully
 *       404:
 *         description: Backup not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:backupId', getBackupDetails);

/**
 * @swagger
 * /api/admin/backups/{backupId}:
 *   delete:
 *     summary: Delete a specific backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup ID
 *     responses:
 *       200:
 *         description: Backup deleted successfully
 *       404:
 *         description: Backup not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.delete('/:backupId', deleteBackup);

/**
 * @swagger
 * /api/admin/backups/{backupId}/verify:
 *   post:
 *     summary: Verify backup integrity
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup ID
 *     responses:
 *       200:
 *         description: Backup verification completed
 *       404:
 *         description: Backup not found
 *       400:
 *         description: Backup cannot be verified
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.post('/:backupId/verify', verifyBackup);

/**
 * @swagger
 * /api/admin/backups/{backupId}/download:
 *   get:
 *     summary: Generate download URL for backup
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Backup ID
 *     responses:
 *       200:
 *         description: Download URL generated successfully
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
 *                     downloadUrl:
 *                       type: string
 *                     expiresIn:
 *                       type: number
 *                     filename:
 *                       type: string
 *       404:
 *         description: Backup not found
 *       400:
 *         description: Backup file not available
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:backupId/download', downloadBackup);

export default router;
