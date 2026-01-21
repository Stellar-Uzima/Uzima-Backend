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

// Create prescription (doctor/admin only)
router.post(
  '/',
  protect,
  requireRole('doctor', 'admin'),
  validate(createPrescriptionSchema),
  activityLogger({ action: 'prescription_create' }),
  createPrescription
);

// Verify prescription (doctor/admin - pharmacist can use doctor role)
router.post(
  '/verify',
  protect,
  requireRole('doctor', 'admin'),
  validate(verifyPrescriptionSchema),
  activityLogger({ action: 'prescription_verify' }),
  verifyPrescription
);

// Get prescription by number
router.get(
  '/:prescriptionNumber',
  protect,
  getPrescription
);

// Reject prescription (doctor/admin)
router.post(
  '/:prescriptionNumber/reject',
  protect,
  requireRole('doctor', 'admin'),
  validate(rejectPrescriptionSchema),
  activityLogger({ action: 'prescription_reject' }),
  rejectPrescription
);

// Get all prescriptions (with filters)
router.get(
  '/',
  protect,
  getPrescriptions
);

export default router;
