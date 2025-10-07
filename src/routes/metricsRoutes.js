import { Router } from 'express';
import { getVitalsMetrics } from '../controllers/metrics.controller.js';
import auth from '../middleware/auth.js';

const router = Router();

// Vitals metrics with optional query: from, to, patientId, bucket=day|week|month
router.get('/vitals', auth, getVitalsMetrics);

export default router;


