import express from 'express';
import userRoutes from './userRoutes.js';
import authRoutes from './authRoutes.js';
import recordRoutes from './recordRoutes.js';
import metricsRoutes from './metricsRoutes.js';
import gdprRoutes from './gdprRoutes.js';
import adminRoutes from './adminRoutes.js';
import adminGDPRRoutes from './adminGDPRRoutes.js';
import backupRoutes from './backupRoutes.js';
import activityLogRoutes from './activityLogRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import prescriptionRoutes from './prescriptionRoutes.js';
import healthRoutes from './healthRoutes.js';
import jobRoutes from './jobRoutes.js';

// import webhookRoutes from './webhookRoutes.js'; // Commented out - file doesn't exist

const router = express.Router();

// Import route modules here
// import userRoutes from './userRoutes.js';
// import authRoutes from './authRoutes.js';

// Define routes
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to Uzima Backend API' });
});

// Use route modules
router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use('/records', recordRoutes);
router.use('/metrics', metricsRoutes);
router.use('/users', gdprRoutes); // GDPR routes for users
router.use('/admin', adminRoutes);
router.use('/admin', adminGDPRRoutes); // GDPR admin routes
router.use('/admin/backups', backupRoutes); // Backup admin routes
// router.use('/payments', webhookRoutes); // Payment webhook routes - commented out
router.use('/activity', activityLogRoutes); // Activity log routes
router.use('/', activityLogRoutes); // Admin activity log routes
router.use('/notify', notificationRoutes); // Notification routes
router.use('/prescriptions', prescriptionRoutes); // Prescription routes
router.use('/health', healthRoutes); // Health check routes
router.use('/jobs', jobRoutes);

export default router;
