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
import { deprecationWarning } from '../middleware/apiVersion.js';

let webhookRoutes;
try {
  webhookRoutes = (await import('./webhookRoutes.js')).default;
} catch (e) {
  webhookRoutes = express.Router();
  console.warn('Webhook routes not loaded:', e.message);
}

const createV1Router = () => {
  const router = express.Router();
  router.use(deprecationWarning('v1'));

  router.get('/', (req, res) => {
    res.json({ message: 'Welcome to Uzima Backend API v1' });
  });

  router.use('/users', userRoutes);
  router.use('/auth', authRoutes);
  router.use('/records', recordRoutes);
  router.use('/metrics', metricsRoutes);
  router.use('/users', gdprRoutes);
  router.use('/admin', adminRoutes);
  router.use('/admin', adminGDPRRoutes);
  router.use('/admin/backups', backupRoutes);
  router.use('/payments', webhookRoutes);
  router.use('/', webhookRoutes);
  router.use('/activity', activityLogRoutes);
  router.use('/', activityLogRoutes);
  router.use('/notify', notificationRoutes);
  router.use('/prescriptions', prescriptionRoutes);

  return router;
};

const createV2Router = () => {
  const router = express.Router();
  router.use(deprecationWarning('v2'));

  router.get('/', (req, res) => {
    res.json({ message: 'Welcome to Uzima Backend API v2' });
  });

  router.use('/users', userRoutes);
  router.use('/auth', authRoutes);
  router.use('/records', recordRoutes);
  router.use('/metrics', metricsRoutes);
  router.use('/users', gdprRoutes);
  router.use('/admin', adminRoutes);
  router.use('/admin', adminGDPRRoutes);
  router.use('/admin/backups', backupRoutes);
  router.use('/payments', webhookRoutes);
  router.use('/', webhookRoutes);
  router.use('/activity', activityLogRoutes);
  router.use('/', activityLogRoutes);
  router.use('/notify', notificationRoutes);
  router.use('/prescriptions', prescriptionRoutes);

  return router;
};

export { createV1Router, createV2Router };
