import { Router } from 'express';
import { getVitalsMetrics } from '../controllers/metrics.controller.js';
import { verifyAdmin } from '../middleware/auth.js';
import { getCacheMetrics, invalidateCache } from '../middleware/cache.js';

const router = Router();

// Vitals metrics with optional query: from, to, patientId, bucket=day|week|month
router.get('/vitals', verifyAdmin, getVitalsMetrics);

// Cache metrics endpoint (admin only)
router.get('/cache', verifyAdmin, (req, res) => {
  const metrics = getCacheMetrics();
  res.json({
    success: true,
    data: metrics,
  });
});

// Manual cache invalidation endpoint (admin only)
router.delete('/cache', verifyAdmin, async (req, res) => {
  const { pattern } = req.query;

  if (!pattern) {
    return res.status(400).json({
      success: false,
      message: 'Pattern query parameter is required (e.g., ?pattern=search:*)',
    });
  }

  const deleted = await invalidateCache(pattern);
  res.json({
    success: true,
    message: `Invalidated ${deleted} cache keys matching pattern: ${pattern}`,
    deletedCount: deleted,
  });
});

export default router;
