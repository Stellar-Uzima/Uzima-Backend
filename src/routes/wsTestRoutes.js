import express from 'express';
import { wsTestController } from '../controllers/wsTestController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

// Test WebSocket functionality - requires authentication
router.post('/send-test-message', protect, wsTestController.sendTestMessage);

// WebSocket health check
router.get('/health', wsTestController.wsHealthCheck);

export default router;
