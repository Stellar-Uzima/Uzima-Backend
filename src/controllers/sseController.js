/* eslint-disable prettier/prettier */
import jwt from 'jsonwebtoken';
import eventManager from '../services/eventManager.js';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';

/**
 * Authenticate token from query parameter or Authorization header
 * @param {string} token - JWT token
 * @returns {Promise<Object|null>} Decoded token or null if invalid
 */
async function authenticateToken(token) {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Optionally verify user still exists
    const user = await User.findById(decoded.id);
    if (!user) return null;
    return { ...decoded, _id: decoded.id };
  } catch (error) {
    logger.debug(`Token authentication failed: ${error.message}`);
    return null;
  }
}

/**
 * SSE Stream Controller
 * Handles Server-Sent Events streaming with authentication and event filtering
 */

/**
 * Stream SSE events to client
 * Query parameters:
 *   - token: JWT authentication token
 *   - events: Comma-separated list of event types to filter (e.g., "record.created,system.alert")
 *
 * Example: GET /events/stream?token=jwt_token&events=record.created,notification
 */
export const streamEvents = async (req, res) => {
  try {
    // Get token from query or Authorization header
    const tokenFromQuery = req.query.token;
    const tokenFromHeader = req.headers.authorization?.split(' ')[1];
    const token = tokenFromQuery || tokenFromHeader;

    if (!token) {
      logger.warn('SSE connection attempt without authentication');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Authenticate the token
    const user = await authenticateToken(token);
    if (!user) {
      logger.warn('SSE connection attempt with invalid token');
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = user._id || user.id;

    // Parse event filters from query
    let filters = null;
    if (req.query.events) {
      filters = req.query.events.split(',').map(e => e.trim());
      logger.info(`SSE connection for user ${userId} with filters: ${filters.join(', ')}`);
    } else {
      logger.info(`SSE connection for user ${userId} accepting all events`);
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    res.status(200);

    // Send initial comment and connection ID
    const connectionId = eventManager.addConnection(userId, res, filters);
    if (!connectionId) {
      return; // Connection limit reached
    }

    res.write(`: SSE connection established\n`);
    res.write(`data: ${JSON.stringify({ connectionId, userId, timestamp: new Date().toISOString() })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      eventManager.removeConnection(userId, connectionId, 'client_disconnect');
      res.end();
    });

    req.on('error', (error) => {
      logger.error(`SSE connection error for ${connectionId}:`, error.message);
      eventManager.removeConnection(userId, connectionId, 'connection_error');
      res.end();
    });

    // Graceful response close handling
    res.on('finish', () => {
      eventManager.removeConnection(userId, connectionId, 'response_finish');
    });

  } catch (error) {
    logger.error('SSE stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.end();
    }
  }
};

/**
 * Get SSE connection statistics
 * Admin only endpoint
 */
export const getStats = (req, res) => {
  try {
    const stats = eventManager.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get SSE stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};

/**
 * Manually trigger a test event (for development/testing)
 * Admin only
 */
export const triggerTestEvent = async (req, res) => {
  try {
    const { eventType = 'test.event', data = {}, userId = null } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: 'eventType is required' });
    }

    eventManager.broadcastEvent(eventType, data, userId);

    res.json({
      success: true,
      message: `Event "${eventType}" triggered`,
      sentTo: userId ? 'specific user' : 'all users',
    });
  } catch (error) {
    logger.error('Failed to trigger test event:', error);
    res.status(500).json({ error: 'Failed to trigger event' });
  }
};

/**
 * Broadcast event from application code
 * Internal endpoint for other parts of the app to emit events
 * Should be called internally, not exposed to clients
 */
export const publishEvent = (eventType, data, userId = null) => {
  try {
    eventManager.broadcastEvent(eventType, data, userId);
    logger.info(`Event published: ${eventType}`);
  } catch (error) {
    logger.error(`Failed to publish event: ${error.message}`);
  }
};

export default {
  streamEvents,
  getStats,
  triggerTestEvent,
  publishEvent,
};
