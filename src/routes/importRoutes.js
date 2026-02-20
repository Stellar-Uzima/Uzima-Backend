import express from 'express';
import multer from 'multer';
import protect from '../middleware/authMiddleware.js';
import {
  uploadCsv,
  getImportStatus,
  downloadErrorReport,
  listImportJobs,
  cancelImport,
} from '../controllers/importController.js';

const router = express.Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
});

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Import
 *   description: CSV import operations for bulk record creation
 */

/**
 * @swagger
 * /import/csv:
 *   post:
 *     summary: Upload a CSV file for bulk record import
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file with columns patientName, diagnosis, treatment, date (optional), history (optional)
 *     responses:
 *       202:
 *         description: Import job created and processing started
 *       400:
 *         description: Invalid file or request
 *       401:
 *         description: Unauthorized
 */
router.post('/csv', csvUpload.single('file'), uploadCsv);

/**
 * @swagger
 * /import/jobs:
 *   get:
 *     summary: List import jobs for the authenticated user
 *     tags: [Import]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, validating, processing, completed, failed, cancelled]
 *     responses:
 *       200:
 *         description: List of import jobs
 *       401:
 *         description: Unauthorized
 */
router.get('/jobs', listImportJobs);

/**
 * @swagger
 * /import/{id}/status:
 *   get:
 *     summary: Get import job status and progress
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Import job ID
 *     responses:
 *       200:
 *         description: Import job status
 *       404:
 *         description: Import job not found
 */
router.get('/:id/status', getImportStatus);

/**
 * @swagger
 * /import/{id}/errors:
 *   get:
 *     summary: Download error report for an import job
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Import job ID
 *     responses:
 *       200:
 *         description: CSV error report file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: No errors to report
 *       404:
 *         description: Import job not found
 */
router.get('/:id/errors', downloadErrorReport);

/**
 * @swagger
 * /import/{id}/cancel:
 *   post:
 *     summary: Cancel a pending or processing import job
 *     tags: [Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Import job ID
 *     responses:
 *       200:
 *         description: Import job cancelled
 *       400:
 *         description: Job cannot be cancelled
 *       404:
 *         description: Import job not found
 */
router.post('/:id/cancel', cancelImport);

export default router;
