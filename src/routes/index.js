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
import analyticsRoutes from './analyticsRoutes.js';

// Optional webhook routes (may not exist)
let webhookRoutes;
try {
  webhookRoutes = (await import('./webhookRoutes.js')).default;
} catch (e) {
  // Create a stub router if webhookRoutes doesn't exist
  webhookRoutes = express.Router();
  console.warn('Webhook routes not loaded:', e.message);
}

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
router.use('/admin/analytics', analyticsRoutes);
router.use('/admin', adminGDPRRoutes); // GDPR admin routes
router.use('/admin/backups', backupRoutes); // Backup admin routes
router.use('/payments', webhookRoutes); // Payment webhook routes
router.use('/', webhookRoutes); // Webhook subscription routes under /webhooks
router.use('/activity', activityLogRoutes); // Activity log routes
router.use('/', activityLogRoutes); // Admin activity log routes
router.use('/notify', notificationRoutes); // Notification routes
router.use('/prescriptions', prescriptionRoutes); // Prescription routes

export default router;
