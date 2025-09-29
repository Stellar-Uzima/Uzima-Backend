import express from 'express';
import pdfController from '../controllers/pdfController.js';
import fileController from '../controllers/fileController.js';
import recordController from '../controllers/recordController.js';
import protect from '../middleware/authMiddleware.js';
import hasRole from '../middleware/requireRole.js';
import handleUpload from '../middleware/uploadMiddleware.js';
import { uploadRateLimit } from '../middleware/rateLimiter.js';
import { cacheGet } from '../middleware/cache.js';
import { recordListKey, recordByIdKey } from '../utils/cacheKeys.js';

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @swagger
 * /api/records:
 *   get:
 *     summary: Get all records
 *     description: Retrieve a list of all records (Admin and Doctor only)
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of records retrieved successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 */
router.get('/', hasRole('doctor', 'admin'), cacheGet((req) => recordListKey({ page: req.query.page || 1, limit: req.query.limit || 20 }), 60), recordController.getAllRecords);

/**
 * @swagger
 * /api/records/{id}:
 *   get:
 *     summary: Get record by ID
 *     description: Retrieve a specific record's details by ID
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     responses:
 *       200:
 *         description: Record details retrieved successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Record not found
 */
router.get('/:id', hasRole('doctor', 'admin', 'patient'), cacheGet((req) => recordByIdKey(req.params.id), 180), recordController.getRecordById);

/**
 * @swagger
 * /api/records:
 *   post:
 *     summary: Create a new record
 *     description: Create a new medical record (Doctor only)
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientName
 *               - diagnosis
 *               - treatment
 *               - txHash
 *             properties:
 *               patientName:
 *                 type: string
 *               diagnosis:
 *                 type: string
 *               treatment:
 *                 type: string
 *               txHash:
 *                 type: string
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 */
router.post('/', hasRole('doctor'), recordController.createRecord);

/**
 * @swagger
 * /api/records/{id}:
 *   put:
 *     summary: Update a record
 *     description: Update an existing medical record (Doctor only)
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patientName:
 *                 type: string
 *               diagnosis:
 *                 type: string
 *               treatment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Record not found
 */
router.put('/:id', hasRole('doctor'), recordController.updateRecord);

/**
 * @swagger
 * /api/records/{id}:
 *   delete:
 *     summary: Delete a record
 *     description: Delete an existing medical record (Admin only)
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     responses:
 *       200:
 *         description: Record deleted successfully
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Record not found
 */
router.delete('/:id', hasRole('admin'), recordController.deleteRecord);

/**
 * @swagger
 * /api/records/{id}/files:
 *   post:
 *     summary: Upload a prescription scan
 *     description: Upload a prescription scan to IPFS and store the CID
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Prescription scan (JPEG/PNG, max 5MB)
 *     responses:
 *       201:
 *         description: File uploaded successfully
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
 *                     cid:
 *                       type: string
 *                     url:
 *                       type: string
 *       400:
 *         description: Invalid file or file too large
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Record not found
 */
router.post('/:id/files', hasRole('doctor', 'admin'), uploadRateLimit, handleUpload, fileController.uploadFile);

/**
 * @swagger
 * /api/records/{id}/files:
 *   get:
 *     summary: Get all files for a record
 *     description: Retrieve all files associated with a record
 *     tags: [Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     responses:
 *       200:
 *         description: Files retrieved successfully
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
 *                     files:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           cid:
 *                             type: string
 *                           fileName:
 *                             type: string
 *                           fileType:
 *                             type: string
 *                           uploadedAt:
 *                             type: string
 *                             format: date-time
 *                           url:
 *                             type: string
 *       401:
 *         description: Unauthorized - User not authenticated
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Record not found
 */
router.get('/:id/files', hasRole('doctor', 'admin', 'patient'), fileController.getFiles);

// PDF generation route
router.get('/:id/pdf', hasRole('doctor', 'admin'), pdfController.generatePDF);

export default router;
