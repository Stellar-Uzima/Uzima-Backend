import express from 'express';
import healthCheckController from '../controllers/healthCheck.controller.js';
import ipRestrictionMiddleware from '../middleware/ipRestriction.js';

const router = express.Router();

router.use(ipRestrictionMiddleware);

router.get('/live', healthCheckController.liveness);
router.get('/ready', healthCheckController.readiness);

export default router;
