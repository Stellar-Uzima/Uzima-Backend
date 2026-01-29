/* eslint-disable prettier/prettier */
import express from 'express';
import {
  streamEvents,
  getStats,
  triggerTestEvent,
} from '../controllers/sseController.js';
import { auth } from '../middleware/authMiddleware.js';
import requireRole from '../middleware/requireRole.js';

const router = express.Router();

/**
 * SSE Routes
 * All routes require authentication via query token or Authorization header
 */

/**
 * GET /events/stream - Connect to SSE stream
 * Query params:
 *   - token: JWT token (alternative to Authorization header)
 *   - events: Comma-separated event types to filter
 *
 * Example:
 *   GET /events/stream?token=jwt_token
 *   GET /events/stream?events=record.created,system.alert
 *   GET /events/stream (with Authorization: Bearer token)
 */
router.get('/stream', streamEvents);

/**
 * GET /events/stats - Get connection statistics (Admin only)
 */
router.get('/stats', auth, requireRole('admin'), getStats);

/**
 * POST /events/test - Trigger test event (Admin/Development only)
 * Body:
 *   {
 *     "eventType": "test.event",
 *     "data": { ... },
 *     "userId": "optional-user-id" (null broadcasts to all)
 *   }
 */
router.post('/test', auth, requireRole('admin'), triggerTestEvent);

export default router;
