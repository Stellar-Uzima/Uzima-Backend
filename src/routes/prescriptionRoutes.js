import express from 'express';
import {
  createPrescription,
  verifyPrescription,
  getPrescription,
  rejectPrescription,
  getPrescriptions,
} from '../controllers/prescriptionController.js';
import protect from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import {
  createPrescriptionSchema,
  verifyPrescriptionSchema,
  rejectPrescriptionSchema,
} from '../validations/prescriptionValidators.js';
import { activityLogger } from '../middleware/activityLogger.js';

const router = express.Router();

// Middleware to check if user has required role
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ success: false, message: 'Forbidden: User not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

/**
 * @swagger
 * /api/prescriptions:
 *   post:
 *     summary: Create a new prescription
 *     description: Create a new digital prescription (Doctor/Admin only)
 *     tags: [Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - medications
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Patient's user ID
 *                 example: "507f1f77bcf86cd799439011"
 *               medications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Amoxicillin"
 *                     dosage:
 *                       type: string
 *                       example: "500mg"
 *                     frequency:
 *                       type: string
 *                       example: "twice daily"
 *                     duration:
 *                       type: string
 *                       example: "7 days"
 *               notes:
 *                 type: string
 *                 example: "Take with food"
 *     responses:
 *       201:
 *         description: Prescription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Prescription'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
// Create prescription (doctor/admin only)
router.post(
  '/',
  protect,
  requireRole('doctor', 'admin'),
  validate(createPrescriptionSchema),
  activityLogger({ action: 'prescription_create' }),
  createPrescription
);

/**
 * @swagger
 * /api/prescriptions/verify:
 *   post:
 *     summary: Verify a prescription
 *     description: Verify and validate a prescription for dispensing (Doctor/Admin only)
 *     tags: [Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prescriptionNumber
 *             properties:
 *               prescriptionNumber:
 *                 type: string
 *                 example: "RX-2024-001234"
 *               verificationNotes:
 *                 type: string
 *                 example: "Verified patient identity"
 *     responses:
 *       200:
 *         description: Prescription verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Prescription'
 *       400:
 *         description: Invalid prescription or already verified
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Prescription not found
 */
// Verify prescription (doctor/admin - pharmacist can use doctor role)
router.post(
  '/verify',
  protect,
  requireRole('doctor', 'admin'),
  validate(verifyPrescriptionSchema),
  activityLogger({ action: 'prescription_verify' }),
  verifyPrescription
);

/**
 * @swagger
 * /api/prescriptions/{prescriptionNumber}:
 *   get:
 *     summary: Get prescription by number
 *     description: Retrieve a specific prescription by its prescription number
 *     tags: [Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: prescriptionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription number
 *         example: "RX-2024-001234"
 *     responses:
 *       200:
 *         description: Prescription retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Prescription'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Prescription not found
 */
// Get prescription by number
router.get(
  '/:prescriptionNumber',
  protect,
  getPrescription
);

/**
 * @swagger
 * /api/prescriptions/{prescriptionNumber}/reject:
 *   post:
 *     summary: Reject a prescription
 *     description: Reject a prescription with a reason (Doctor/Admin only)
 *     tags: [Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: prescriptionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Medication interaction detected"
 *     responses:
 *       200:
 *         description: Prescription rejected successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Prescription not found
 */
// Reject prescription (doctor/admin)
router.post(
  '/:prescriptionNumber/reject',
  protect,
  requireRole('doctor', 'admin'),
  validate(rejectPrescriptionSchema),
  activityLogger({ action: 'prescription_reject' }),
  rejectPrescription
);

/**
 * @swagger
 * /api/prescriptions:
 *   get:
 *     summary: Get all prescriptions
 *     description: Retrieve a list of prescriptions with optional filters
 *     tags: [Prescriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, verified, rejected, dispensed]
 *         description: Filter by prescription status
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: Filter by patient ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Prescriptions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Prescription'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
// Get all prescriptions (with filters)
router.get(
  '/',
  protect,
  getPrescriptions
);

export default router;
