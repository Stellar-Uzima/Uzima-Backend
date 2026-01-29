import express from 'express';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';
import {
  createSubscription,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  deleteSubscription,
  retryDelivery,
} from '../services/webhookService.js';

const router = express.Router();

router.post('/webhooks/subscriptions', protect, hasPermission('admin'), async (req, res) => {
  try {
    const sub = await createSubscription(req.body);
    res.status(201).json({ success: true, data: sub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/webhooks/subscriptions', protect, hasPermission('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const data = await listSubscriptions({ limit, skip });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/webhooks/subscriptions/:id', protect, hasPermission('admin'), async (req, res) => {
  try {
    const sub = await getSubscription(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/webhooks/subscriptions/:id', protect, hasPermission('admin'), async (req, res) => {
  try {
    const sub = await updateSubscription(req.params.id, req.body);
    if (!sub) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/webhooks/subscriptions/:id', protect, hasPermission('admin'), async (req, res) => {
  try {
    const sub = await deleteSubscription(req.params.id);
    if (!sub) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/webhooks/deliveries/:id/retry', protect, hasPermission('admin'), async (req, res) => {
  try {
    const d = await retryDelivery(req.params.id);
    res.json({ success: true, data: d });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;