/**
 * API Metrics Middleware
 * Tracks all API requests and logs metrics to MongoDB
 * Non-blocking async operation to avoid impacting response times
 */
import APIMetric from '../models/APIMetric.js';

/**
 * Middleware to capture and log API metrics
 * Attached early to measure full request processing time
 */
export const apiMetricsMiddleware = (req, res, next) => {
  // Record start time with high precision
  req.startTime = process.hrtime.bigint();
  req.startMs = Date.now();

  // Capture request metadata
  const originalEnd = res.end;
  const originalJson = res.json;
  const originalSend = res.send;

  let responseBody = '';
  let isJsonResponse = false;

  // Override res.json to capture response body
  res.json = function (data) {
    isJsonResponse = true;
    responseBody = JSON.stringify(data);
    return originalJson.call(this, data);
  };

  // Override res.send to capture response body
  res.send = function (data) {
    if (typeof data === 'object') {
      responseBody = JSON.stringify(data);
      isJsonResponse = true;
    } else {
      responseBody = String(data);
    }
    return originalSend.call(this, data);
  };

  // Override res.end to capture metrics
  res.end = function (chunk, encoding) {
    // Calculate duration in milliseconds
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - req.startTime) / 1_000_000; // Convert to ms

    // Prepare metric data
    const metricData = {
      requestId: req.requestId || req.correlationId || req.headers['x-request-id'],
      endpoint: req.baseUrl + req.path,
      method: req.method,
      statusCode: res.statusCode,
      duration: Math.round(duration * 100) / 100, // Round to 2 decimals
      userId: req.user ? req.user._id : null,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress,
      requestSize: parseInt(req.headers['content-length'] || 0),
      responseSize: chunk ? Buffer.byteLength(chunk, encoding) : responseBody.length,
      cacheHit: res.getHeader('x-cache-hit') === 'true',
      queryString: Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : null,
      tags: [],
    };

    // Capture error information if present
    if (res.statusCode >= 400) {
      if (res.locals.error) {
        metricData.errorMessage = res.locals.error.message;
        if (process.env.NODE_ENV !== 'production') {
          metricData.errorStack = res.locals.error.stack;
        }
      }
    }

    // Add custom DB time if available
    if (req.dbTime) {
      metricData.dbTime = req.dbTime;
    }

    // Add any custom tags
    if (req.metricsTags && Array.isArray(req.metricsTags)) {
      metricData.tags = req.metricsTags;
    }

    // Log metrics asynchronously without blocking response
    recordMetricAsync(metricData);

    // Call original end
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Asynchronously record metrics without blocking the response
 * Silently fails if there's an error to avoid affecting the API
 */
async function recordMetricAsync(metricData) {
  try {
    // Use setImmediate to ensure this runs after response is sent
    setImmediate(async () => {
      try {
        await APIMetric.recordMetric(metricData);
      } catch (error) {
        // Log error but don't throw
        console.error('[APIMetrics] Error recording metric:', error.message);
      }
    });
  } catch (error) {
    // Silently handle errors to avoid impacting API
    console.error('[APIMetrics] Error in metric recording process:', error.message);
  }
}

/**
 * Middleware to track database operation timing
 * Usage: wrap database calls to capture their execution time
 */
export const trackDbTime = async (operation, operationFn) => {
  const start = Date.now();
  try {
    const result = await operationFn();
    return result;
  } finally {
    const duration = Date.now() - start;
    // Store in a request-scoped variable if available
    if (global.currentRequest) {
      global.currentRequest.dbTime = (global.currentRequest.dbTime || 0) + duration;
    }
  }
};

/**
 * Middleware to add metrics tags to requests
 * Usage in controllers: req.addMetricsTag('important-operation')
 */
export const metricsTaggingMiddleware = (req, res, next) => {
  req.metricsTags = [];

  req.addMetricsTag = tag => {
    if (!req.metricsTags.includes(tag)) {
      req.metricsTags.push(tag);
    }
  };

  next();
};

export default apiMetricsMiddleware;
