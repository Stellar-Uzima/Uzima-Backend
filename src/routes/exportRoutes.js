import express from 'express';
import { requestExport, getExportStatus, downloadExport } from '../controllers/exportController.js';
import protect from '../middleware/authMiddleware.js'; // Authentication middleware

const router = express.Router();

// All export routes require authentication
router.use(protect);

/**
 * @swagger
 * /exports/request:
 *   post:
 *     summary: Request a data export
 *     tags: [Exports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exportType
 *             properties:
 *               exportType:
 *                 type: string
 *                 enum: [records, users, prescriptions]
 *               filters:
 *                 type: object
 *                 description: Optional filters for the export
 *               format:
 *                 type: string
 *                 enum: [json, csv]
 *                 default: json
 *     responses:
 *       200:
 *         description: Export job queued successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/request', requestExport);

/**
 * @swagger
 * /exports/status/{jobId}:
 *   get:
 *     summary: Get export job status
 *     tags: [Exports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: The export job ID
 *     responses:
 *       200:
 *         description: Export status retrieved successfully
 *       404:
 *         description: Export job not found
 *       500:
 *         description: Server error
 */
router.get('/status/:jobId', getExportStatus);

/**
 * @swagger
 * /exports/download/{jobId}:
 *   get:
 *     summary: Download completed export file
 *     tags: [Exports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: The export job ID
 *     responses:
 *       200:
 *         description: Export file downloaded successfully
 *       400:
 *         description: Export is not ready for download
 *       404:
 *         description: Export job or file not found
 *       500:
 *         description: Server error
 */
router.get('/download/:jobId', downloadExport);

export default router;
