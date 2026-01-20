import { Router } from 'express';
import { getVitalsMetrics } from '../controllers/metrics.controller.js';
import { verifyAdmin } from '../middleware/auth.js';

const router = Router();

// Vitals metrics with optional query: from, to, patientId, bucket=day|week|month
router.get('/vitals', verifyAdmin, getVitalsMetrics);

export default router;


