/* eslint-disable prettier/prettier */
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * EventManager handles SSE connections, event distribution, and connection lifecycle
 * Features:
 * - Manages multiple concurrent SSE connections
 * - Broadcasts events to filtered subscribers
 * - Implements heartbeat/keep-alive mechanism
 * - Cleans up abandoned connections (memory leak prevention)
 * - Supports event filtering by type
 */
class EventManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // Map<userId, Set<{response, filters, lastActivity, id}>
    this.connectionIdCounter = 0;
    this.heartbeatInterval = 30000; // 30 seconds
    this.inactivityTimeout = 60000; // 60 seconds of inactivity
    this.maxConnections = 1000; // Max concurrent connections per app
    this.totalConnections = 0;

    // Start heartbeat and cleanup jobs
    this.startHeartbeat();
    this.startCleanupJob();
  }

  /**
   * Register a new SSE connection
   * @param {string} userId - The authenticated user ID
   * @param {Response} response - Express response object
   * @param {string[]} filters - Event types to filter (null = all)
   * @returns {string} Connection ID
   */
  addConnection(userId, response, filters = null) {
    if (this.totalConnections >= this.maxConnections) {
      logger.warn(`Max connections reached: ${this.maxConnections}`);
      response.status(429).json({ error: 'Too many concurrent connections' });
      return null;
    }

    const connectionId = `${userId}-${++this.connectionIdCounter}`;

    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }

    const connectionData = {
      response,
      filters: filters ? new Set(filters) : null, // null means accept all events
      lastActivity: Date.now(),
      id: connectionId,
      userId,
    };

    this.connections.get(userId).add(connectionData);
    this.totalConnections++;

    logger.info(`SSE connection added: ${connectionId} (total: ${this.totalConnections})`);
    this.emit('connectionAdded', { userId, connectionId, filterCount: filters?.length || 0 });

    return connectionId;
  }

  /**
   * Remove a connection
   * @param {string} userId - The user ID
   * @param {string} connectionId - The connection ID
   * @param {string} reason - Reason for removal
   */
  removeConnection(userId, connectionId, reason = 'normal_closure') {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const conn = Array.from(userConnections).find(c => c.id === connectionId);
    if (!conn) return;

    userConnections.delete(conn);
    this.totalConnections--;

    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    logger.info(
      `SSE connection removed: ${connectionId} (reason: ${reason}, total: ${this.totalConnections})`
    );
    this.emit('connectionRemoved', { userId, connectionId, reason });
  }

  /**
   * Broadcast an event to subscribed clients
   * @param {string} eventType - Type of event (e.g., 'record.created', 'system.alert')
   * @param {Object} data - Event payload
   * @param {string|null} userId - Optional: send to specific user only. If null, broadcast to all.
   */
  broadcastEvent(eventType, data, userId = null) {
    const timestamp = new Date().toISOString();
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      timestamp,
      data,
    };

    if (userId) {
      // Send to specific user
      this.sendEventToUser(userId, event);
    } else {
      // Broadcast to all users
      for (const [uid, connections] of this.connections.entries()) {
        this.sendEventToUser(uid, event);
      }
    }

    this.emit('eventBroadcasted', { eventType, userId, timestamp });
  }

  /**
   * Send event to a specific user's connections
   * @private
   * @param {string} userId - The user ID
   * @param {Object} event - The event object
   */
  sendEventToUser(userId, event) {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const disconnectedConnections = [];

    for (const conn of userConnections) {
      // Check if connection should receive this event (based on filters)
      if (conn.filters && !conn.filters.has(event.type)) {
        continue; // Skip if not matching filter
      }

      try {
        conn.response.write(`id: ${event.id}\n`);
        conn.response.write(`event: ${event.type}\n`);
        conn.response.write(`data: ${JSON.stringify(event.data)}\n\n`);
        conn.lastActivity = Date.now();
      } catch (error) {
        logger.error(`Failed to send event to connection ${conn.id}:`, error.message);
        disconnectedConnections.push(conn);
      }
    }

    // Clean up broken connections
    for (const conn of disconnectedConnections) {
      this.removeConnection(userId, conn.id, 'send_error');
    }
  }

  /**
   * Send heartbeat to keep connections alive
   * Prevents timeout on reverse proxies and load balancers
   * @private
   */
  sendHeartbeat() {
    const heartbeat = { type: 'heartbeat', timestamp: new Date().toISOString() };
    const disconnectedConnections = [];

    for (const [userId, connections] of this.connections.entries()) {
      for (const conn of connections) {
        try {
          conn.response.write(`:heartbeat ${Date.now()}\n\n`);
          conn.lastActivity = Date.now();
        } catch (error) {
          logger.warn(`Heartbeat failed for connection ${conn.id}: ${error.message}`);
          disconnectedConnections.push({ userId, conn });
        }
      }
    }

    // Clean up broken connections
    for (const { userId, conn } of disconnectedConnections) {
      this.removeConnection(userId, conn.id, 'heartbeat_failed');
    }
  }

  /**
   * Start periodic heartbeat transmission
   * @private
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);

    // Prevent the interval from keeping the process alive
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Clean up idle/abandoned connections
   * @private
   */
  startCleanupJob() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const disconnectedConnections = [];

      for (const [userId, connections] of this.connections.entries()) {
        for (const conn of connections) {
          // Close connections that haven't received activity in inactivityTimeout
          if (now - conn.lastActivity > this.inactivityTimeout) {
            logger.warn(
              `Closing idle connection ${conn.id} after ${this.inactivityTimeout}ms`
            );
            try {
              conn.response.end();
            } catch (error) {
              logger.debug(`Error closing idle connection: ${error.message}`);
            }
            disconnectedConnections.push({ userId, conn });
          }
        }
      }

      for (const { userId, conn } of disconnectedConnections) {
        this.removeConnection(userId, conn.id, 'inactivity_timeout');
      }
    }, this.inactivityTimeout);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Get connection statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      totalConnections: this.totalConnections,
      userCount: this.connections.size,
      userDetails: Array.from(this.connections.entries()).map(([userId, conns]) => ({
        userId,
        connections: conns.size,
        filters: Array.from(conns).map(c => c.filters ? Array.from(c.filters) : null),
      })),
    };
  }

  /**
   * Gracefully shutdown the event manager
   * Closes all connections and cleans up timers
   */
  shutdown() {
    logger.info('Shutting down EventManager...');

    // Clear timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    // Close all connections
    for (const [userId, connections] of this.connections.entries()) {
      for (const conn of connections) {
        try {
          conn.response.end();
        } catch (error) {
          logger.debug(`Error closing connection during shutdown: ${error.message}`);
        }
      }
    }

    this.connections.clear();
    this.totalConnections = 0;
    logger.info('EventManager shutdown complete');
  }
}

// Export singleton instance
export default new EventManager();
