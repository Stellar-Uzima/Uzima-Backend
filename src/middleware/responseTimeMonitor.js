import { performance } from 'perf_hooks';

// In-memory storage for timing data
const timingData = new Map();
const slowRequestThreshold = 2000; // 2 seconds in milliseconds

// Track endpoint statistics
const endpointStats = new Map();

/**
 * Initialize timing data for an endpoint
 */
function initializeEndpointStats(endpoint) {
  if (!endpointStats.has(endpoint)) {
    endpointStats.set(endpoint, {
      totalRequests: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      slowRequests: 0,
      recentTimes: [] // Keep last 100 response times for trend analysis
    });
  }
}

/**
 * Update endpoint statistics
 */
function updateEndpointStats(endpoint, responseTime) {
  const stats = endpointStats.get(endpoint);
  stats.totalRequests++;
  stats.totalTime += responseTime;
  stats.minTime = Math.min(stats.minTime, responseTime);
  stats.maxTime = Math.max(stats.maxTime, responseTime);
  
  if (responseTime > slowRequestThreshold) {
    stats.slowRequests++;
  }
  
  // Keep only recent 100 times for trend analysis
  stats.recentTimes.push(responseTime);
  if (stats.recentTimes.length > 100) {
    stats.recentTimes.shift();
  }
}

/**
 * Get average response time for an endpoint
 */
function getAverageTime(endpoint) {
  const stats = endpointStats.get(endpoint);
  return stats.totalRequests > 0 ? stats.totalTime / stats.totalRequests : 0;
}

/**
 * Get performance trend for an endpoint
 */
function getPerformanceTrend(endpoint) {
  const stats = endpointStats.get(endpoint);
  if (stats.recentTimes.length < 10) return 'insufficient_data';
  
  const recent = stats.recentTimes.slice(-10);
  const older = stats.recentTimes.slice(-20, -10);
  
  if (older.length === 0) return 'insufficient_data';
  
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  
  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  if (change > 10) return 'degrading';
  if (change < -10) return 'improving';
  return 'stable';
}

/**
 * Log slow request with details
 */
function logSlowRequest(req, responseTime, endpoint) {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    endpoint,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    correlationId: req.correlationId || 'none',
    statusCode: req.statusCode || 'N/A'
  };
  
  console.warn('🐌 SLOW REQUEST DETECTED:', JSON.stringify(logData, null, 2));
  
  // Trigger alert if configured
  if (global.eventManager) {
    global.eventManager.emit('slow_request', logData);
  }
}

/**
 * Middleware to monitor API response times
 */
export function responseTimeMonitor(req, res, next) {
  const startTime = performance.now();
  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  
  // Initialize endpoint stats if not exists
  initializeEndpointStats(endpoint);
  
  // Store original res.end to capture when response is finished
  const originalEnd = res.end;
  res.end = function(...args) {
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);
    
    // Add X-Response-Time header
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    
    // Update statistics
    updateEndpointStats(endpoint, responseTime);
    
    // Log slow requests
    if (responseTime > slowRequestThreshold) {
      logSlowRequest(req, responseTime, endpoint);
    }
    
    // Store timing data for this request
    const timingId = req.correlationId || `${Date.now()}-${Math.random()}`;
    timingData.set(timingId, {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      endpoint,
      responseTime,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      correlationId: req.correlationId
    });
    
    // Clean up old timing data (keep last 1000 entries)
    if (timingData.size > 1000) {
      const oldestKey = timingData.keys().next().value;
      timingData.delete(oldestKey);
    }
    
    // Call original end
    originalEnd.apply(this, args);
  };
  
  next();
}

/**
 * Get all timing data
 */
export function getTimingData() {
  return Array.from(timingData.values());
}

/**
 * Get slowest endpoints
 */
export function getSlowestEndpoints(limit = 10) {
  const endpoints = Array.from(endpointStats.entries()).map(([endpoint, stats]) => ({
    endpoint,
    averageTime: Math.round(getAverageTime(endpoint)),
    maxTime: stats.maxTime,
    slowRequests: stats.slowRequests,
    totalRequests: stats.totalRequests,
    slowRequestPercentage: Math.round((stats.slowRequests / stats.totalRequests) * 100),
    trend: getPerformanceTrend(endpoint)
  }));
  
  return endpoints
    .sort((a, b) => b.averageTime - a.averageTime)
    .slice(0, limit);
}

/**
 * Get timing data for export
 */
export function exportTimingData(format = 'json') {
  const data = {
    exportTimestamp: new Date().toISOString(),
    summary: {
      totalRequests: Array.from(endpointStats.values()).reduce((sum, stats) => sum + stats.totalRequests, 0),
      totalEndpoints: endpointStats.size,
      slowRequests: Array.from(endpointStats.values()).reduce((sum, stats) => sum + stats.slowRequests, 0)
    },
    endpoints: Array.from(endpointStats.entries()).map(([endpoint, stats]) => ({
      endpoint,
      totalRequests: stats.totalRequests,
      averageTime: Math.round(getAverageTime(endpoint)),
      minTime: stats.minTime === Infinity ? 0 : stats.minTime,
      maxTime: stats.maxTime,
      slowRequests: stats.slowRequests,
      slowRequestPercentage: Math.round((stats.slowRequests / stats.totalRequests) * 100),
      trend: getPerformanceTrend(endpoint)
    })),
    recentRequests: getTimingData().slice(-100) // Last 100 requests
  };
  
  if (format === 'csv') {
    const headers = ['Endpoint', 'Total Requests', 'Avg Time (ms)', 'Min Time (ms)', 'Max Time (ms)', 'Slow Requests', 'Slow %', 'Trend'];
    const rows = data.endpoints.map(ep => [
      ep.endpoint,
      ep.totalRequests,
      ep.averageTime,
      ep.minTime,
      ep.maxTime,
      ep.slowRequests,
      ep.slowRequestPercentage,
      ep.trend
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
  
  return JSON.stringify(data, null, 2);
}

/**
 * Clear timing data
 */
export function clearTimingData() {
  timingData.clear();
  endpointStats.clear();
}

/**
 * Get performance trends for all endpoints
 */
export function getPerformanceTrends() {
  return Array.from(endpointStats.entries()).map(([endpoint, stats]) => ({
    endpoint,
    trend: getPerformanceTrend(endpoint),
    averageTime: Math.round(getAverageTime(endpoint)),
    recentAverage: stats.recentTimes.length > 0 
      ? Math.round(stats.recentTimes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, stats.recentTimes.length))
      : 0
  }));
}

export default responseTimeMonitor;
