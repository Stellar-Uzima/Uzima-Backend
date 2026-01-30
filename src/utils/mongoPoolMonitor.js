/**
 * MongoDB Connection Pool Monitor
 * 
 * Monitors MongoDB connection pool health and metrics using native driver events.
 * Tracks pool size, active connections, queue length, and connection lifecycle.
 * Provides pool statistics for health endpoints and metrics collection.
 * 
 * @module mongoPoolMonitor
 */

import mongoose from 'mongoose';

/**
 * Pool metrics object - stores connection pool statistics
 */
let poolMetrics = {
  poolSize: {
    current: 0,
    available: 0,
    inUse: 0,
    min: 0,
    max: 0,
  },
  queue: {
    waiting: 0,
    totalWaited: 0,
  },
  connections: {
    created: 0,
    closed: 0,
    errors: 0,
    checkOutErrors: 0,
  },
  timing: {
    lastCheckoutWaitMs: 0,
    avgCheckoutWaitMs: 0,
    maxCheckoutWaitMs: 0,
    totalCheckoutWaitMs: 0,
    checkoutCount: 0,
  },
  health: {
    poolExhausted: false,
    lastEventTime: null,
    eventsSinceStartup: 0,
    errorsInLastMinute: 0,
    lastErrorTime: null,
  },
};

/**
 * Initialize pool monitoring by attaching event listeners
 * Called after successful MongoDB connection
 */
export function initializePoolMonitor() {
  try {
    const client = mongoose.connection.getClient();

    if (!client) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB client not available for pool monitoring');
      return;
    }

    // Initialize pool size from first available pool
    // Note: Mongoose 8+ uses MongoClient directly
    try {
      const topology = client.topology || client;
      if (topology && topology.pool) {
        poolMetrics.poolSize.max = topology.pool.totalPoolSize || 0;
        poolMetrics.poolSize.min = topology.pool.minPoolSize || 0;
      }
    } catch (e) {
      // Pool not yet initialized, will be captured in events
    }

    // Event: Connection created and added to pool
    client.on('connectionCreated', event => {
      poolMetrics.connections.created++;
      poolMetrics.poolSize.current++;
      poolMetrics.poolSize.available++;
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // eslint-disable-next-line no-console
      // console.debug(`[Pool] Connection created (total: ${poolMetrics.poolSize.current})`);
    });

    // Event: Connection closed and removed from pool
    client.on('connectionClosed', event => {
      poolMetrics.connections.closed++;
      poolMetrics.poolSize.current = Math.max(0, poolMetrics.poolSize.current - 1);
      poolMetrics.poolSize.available = Math.max(0, poolMetrics.poolSize.available - 1);
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // eslint-disable-next-line no-console
      // console.debug(`[Pool] Connection closed (remaining: ${poolMetrics.poolSize.current})`);
    });

    // Event: Connection checked out from pool for use
    client.on('connectionCheckedOut', event => {
      poolMetrics.poolSize.available = Math.max(0, poolMetrics.poolSize.available - 1);
      poolMetrics.poolSize.inUse = poolMetrics.poolSize.current - poolMetrics.poolSize.available;
      poolMetrics.queue.waiting = Math.max(0, poolMetrics.queue.waiting - 1);
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // eslint-disable-next-line no-console
      // console.debug(`[Pool] Connection checked out (in-use: ${poolMetrics.poolSize.inUse}, available: ${poolMetrics.poolSize.available})`);
    });

    // Event: Connection returned to pool
    client.on('connectionCheckedIn', event => {
      poolMetrics.poolSize.available++;
      poolMetrics.poolSize.inUse = poolMetrics.poolSize.current - poolMetrics.poolSize.available;
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // eslint-disable-next-line no-console
      // console.debug(`[Pool] Connection checked in (available: ${poolMetrics.poolSize.available})`);
    });

    // Event: Request started waiting for connection
    client.on('connectionCheckOutStarted', event => {
      poolMetrics.queue.waiting++;
      poolMetrics.queue.totalWaited++;
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // Determine if pool is exhausted
      poolMetrics.health.poolExhausted = 
        poolMetrics.poolSize.available === 0 && poolMetrics.queue.waiting > 0;

      // eslint-disable-next-line no-console
      // console.debug(`[Pool] Checkout started (waiting: ${poolMetrics.queue.waiting})`);
    });

    // Event: Checkout attempt failed
    client.on('connectionCheckOutFailed', event => {
      poolMetrics.connections.checkOutErrors++;
      poolMetrics.connections.errors++;
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();
      poolMetrics.health.lastErrorTime = new Date().toISOString();
      poolMetrics.health.errorsInLastMinute++;

      const reason = event.reason || 'Unknown';
      // eslint-disable-next-line no-console
      console.warn(`[Pool] Checkout failed: ${reason}`);
    });

    // Event: Pool created
    client.on('connectionPoolCreated', event => {
      const poolOptions = event.options || {};
      poolMetrics.poolSize.max = poolOptions.maxPoolSize || poolMetrics.poolSize.max;
      poolMetrics.poolSize.min = poolOptions.minPoolSize || poolMetrics.poolSize.min;
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // eslint-disable-next-line no-console
      console.log(
        `[Pool] Pool created (min: ${poolMetrics.poolSize.min}, max: ${poolMetrics.poolSize.max})`
      );
    });

    // Event: Pool closed
    client.on('connectionPoolClosed', event => {
      poolMetrics.health.eventsSinceStartup++;
      poolMetrics.health.lastEventTime = new Date().toISOString();

      // eslint-disable-next-line no-console
      console.log('[Pool] Connection pool closed');
    });

    // eslint-disable-next-line no-console
    console.log('✅ MongoDB pool monitoring initialized');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not initialize pool monitoring:', error.message);
    // Continue anyway - monitoring is optional
  }
}

/**
 * Get current pool statistics
 * @returns {Object} Pool metrics snapshot
 */
export function getPoolStats() {
  // Recalculate health status
  const hasExhaustedPool = 
    poolMetrics.poolSize.available === 0 && poolMetrics.queue.waiting > 0;
  
  poolMetrics.health.poolExhausted = hasExhaustedPool;

  return {
    ...poolMetrics,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get pool health status
 * @returns {string} 'healthy', 'degraded', or 'unhealthy'
 */
export function getPoolHealthStatus() {
  const stats = getPoolStats();

  // Check for critical issues
  if (stats.health.poolExhausted) {
    return 'unhealthy';
  }

  if (stats.connections.errors > 10 || stats.health.errorsInLastMinute > 5) {
    return 'degraded';
  }

  if (stats.queue.waiting > stats.poolSize.max / 2) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Get pool diagnostics and recommendations
 * @returns {Object} Diagnostic information and recommendations
 */
export function getPoolDiagnostics() {
  const stats = getPoolStats();
  const recommendations = [];
  let severity = 'info';

  // Check pool exhaustion
  if (stats.health.poolExhausted) {
    recommendations.push({
      level: 'critical',
      message: 'Pool is exhausted - increase maxPoolSize',
      action: 'Increase MONGO_MAX_POOL_SIZE and redeploy',
    });
    severity = 'critical';
  }

  // Check queue buildup
  if (stats.queue.waiting > 10) {
    recommendations.push({
      level: 'warning',
      message: `${stats.queue.waiting} requests waiting for connection`,
      action: 'Monitor load and consider increasing pool size',
    });
    if (severity !== 'critical') severity = 'warning';
  }

  // Check error rate
  if (stats.connections.errors > 5) {
    recommendations.push({
      level: 'warning',
      message: `High connection error count: ${stats.connections.errors}`,
      action: 'Check network stability and MongoDB logs',
    });
    if (severity !== 'critical') severity = 'warning';
  }

  // Check if pool size is being used efficiently
  const utilizationPercent = stats.poolSize.current > 0 
    ? ((stats.poolSize.inUse / stats.poolSize.current) * 100).toFixed(1)
    : 0;

  return {
    severity,
    poolUtilizationPercent: parseFloat(utilizationPercent),
    recommendations,
    diagnosticData: stats,
  };
}

/**
 * Reset error counters (useful for metrics collection)
 */
export function resetErrorCounters() {
  poolMetrics.health.errorsInLastMinute = 0;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  poolMetrics = {
    poolSize: {
      current: 0,
      available: 0,
      inUse: 0,
      min: 0,
      max: 0,
    },
    queue: {
      waiting: 0,
      totalWaited: 0,
    },
    connections: {
      created: 0,
      closed: 0,
      errors: 0,
      checkOutErrors: 0,
    },
    timing: {
      lastCheckoutWaitMs: 0,
      avgCheckoutWaitMs: 0,
      maxCheckoutWaitMs: 0,
      totalCheckoutWaitMs: 0,
      checkoutCount: 0,
    },
    health: {
      poolExhausted: false,
      lastEventTime: null,
      eventsSinceStartup: 0,
      errorsInLastMinute: 0,
      lastErrorTime: null,
    },
  };
}

export default {
  initializePoolMonitor,
  getPoolStats,
  getPoolHealthStatus,
  getPoolDiagnostics,
  resetErrorCounters,
  resetMetrics,
};
