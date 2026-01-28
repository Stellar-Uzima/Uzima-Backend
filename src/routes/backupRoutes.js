import express from 'express';
import {
  getBackups,
  getBackupStatistics,
  getBackupDetails,
  triggerBackup,
  deleteBackup,
  verifyBackup,
  downloadBackup,
  createFilteredBackup,
  getFilteredBackups,
  downloadFilteredBackup,
  getFilteredBackupMetadata,
  deleteFilteredBackup,
} from '../controllers/backupController.js';
import { auth } from '../middleware/authMiddleware.js';
import protect from '../middleware/authMiddleware.js';
import requireRoles from '../middleware/requireRole.js';
import { createCustomRateLimit } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validationMiddleware.js';
import {
  createFilteredBackupSchema,
  downloadFilteredBackupSchema,
  backupIdSchema,
  listFilteredBackupsSchema,
} from '../validations/backupValidators.js';

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
 * /api/admin/backups/create:
 *   post:
 *     summary: Create filtered backup with advanced options
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collections
 *             properties:
 *               collections:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Collection names to backup
 *                 example: ["users", "records", "prescriptions"]
 *               filters:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date-time
 *                     description: Start date for filtering records
 *                   endDate:
 *                     type: string
 *                     format: date-time
 *                     description: End date for filtering records
 *                   recordTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Filter by record types
 *                   userId:
 *                     type: string
 *                     description: Filter by specific user
 *                   status:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Filter by status
 *               format:
 *                 type: string
 *                 enum: [json, csv, both]
 *                 default: both
 *                 description: Export format
 *     responses:
 *       201:
 *         description: Filtered backup created successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post(
  '/create',
  protect,
  validate(createFilteredBackupSchema),
  createCustomRateLimit({ windowMs: 15 * 60 * 1000, max: 5 }),
  createFilteredBackup
);

/**
 * @swagger
 * /api/admin/backups/filtered:
 *   get:
 *     summary: Get list of filtered backups
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Filtered backups retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/filtered', protect, validate(listFilteredBackupsSchema), getFilteredBackups);

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

/**
 * @swagger
 * /api/admin/backups/{backupId}/metadata:
 *   get:
 *     summary: Get filtered backup metadata
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
 *         description: Metadata retrieved successfully
 *       404:
 *         description: Backup not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:backupId/metadata', protect, validate(backupIdSchema), getFilteredBackupMetadata);

/**
 * @swagger
 * /api/admin/backups/{backupId}/file:
 *   get:
 *     summary: Download filtered backup file
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
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: File format to download
 *     responses:
 *       200:
 *         description: File downloaded successfully
 *       404:
 *         description: Backup not found
 *       400:
 *         description: Invalid format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/:backupId/file',
  protect,
  validate(downloadFilteredBackupSchema),
  downloadFilteredBackup
);

/**
 * @swagger
 * /api/admin/backups/{backupId}/filtered:
 *   delete:
 *     summary: Delete filtered backup
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
router.delete('/:backupId/filtered', protect, validate(backupIdSchema), deleteFilteredBackup);

export default router;
