import ActivityLog from '../models/ActivityLog.js';
import { v4 as uuidv4 } from 'uuid';

// Helper function to determine action type based on route and method
const determineAction = (method, path, body = {}) => {
  const normalizedPath = path.toLowerCase();
  
  // Authentication actions
  if (normalizedPath.includes('/auth/login')) return 'login';
  if (normalizedPath.includes('/auth/logout')) return 'logout';
  if (normalizedPath.includes('/auth/reset-password')) {
    return method === 'POST' ? 'password_reset_request' : 'password_reset_complete';
  }
  if (normalizedPath.includes('/auth/2fa')) {
    if (method === 'POST') return 'two_factor_enabled';
    if (method === 'DELETE') return 'two_factor_disabled';
    if (method === 'PUT') return 'two_factor_verified';
  }
  
  // Record actions
  if (normalizedPath.includes('/record')) {
    if (method === 'POST') return 'record_create';
    if (method === 'PUT' || method === 'PATCH') return 'record_update';
    if (method === 'DELETE') return 'record_delete';
    if (method === 'GET') return normalizedPath.includes('/download') ? 'record_download' : 'record_view';
  }
  
  // User management actions
  if (normalizedPath.includes('/user')) {
    if (method === 'POST') return 'user_create';
    if (method === 'PUT' || method === 'PATCH') return 'user_update';
    if (method === 'DELETE') return 'user_delete';
  }
  
  // File actions
  if (normalizedPath.includes('/file')) {
    if (method === 'POST') return 'file_upload';
    if (method === 'GET') return 'file_download';
    if (method === 'DELETE') return 'file_delete';
  }
  
  // Admin actions
  if (normalizedPath.includes('/admin')) {
    if (normalizedPath.includes('/backup')) {
      if (method === 'POST') return 'backup_create';
      if (method === 'GET') return 'admin_access';
    }
    return 'admin_access';
  }
  
  // GDPR actions
  if (normalizedPath.includes('/gdpr')) {
    if (method === 'POST') {
      return body.requestType === 'export' ? 'gdpr_export_request' : 'gdpr_delete_request';
    }
    return 'gdpr_data_access';
  }
  
  // Inventory actions
  if (normalizedPath.includes('/inventory')) {
    if (method === 'POST') return 'inventory_create';
    if (method === 'PUT' || method === 'PATCH') return 'inventory_update';
    if (normalizedPath.includes('/adjust')) return 'inventory_adjust';
    if (normalizedPath.includes('/consume')) return 'inventory_consume';
  }
  
  // Payment actions for App
  if (normalizedPath.includes('/payment')) {
    if (method === 'POST') return 'payment_create';
    return 'payment_access';
  }
  
  // For Stellar/Contract actions
  if (normalizedPath.includes('/stellar') || normalizedPath.includes('/contract')) {
    return 'contract_interaction';
  }
  
  // Default action
  return 'api_access';
};

// Helper function to extract resource information
const extractResourceInfo = (path, body = {}, params = {}) => {
  const resourceInfo = {};
  
  // Extract resource type and ID from path
  if (path.includes('/record')) {
    resourceInfo.resourceType = 'record';
    resourceInfo.resourceId = params.id || params.recordId || body.recordId;
  } else if (path.includes('/user')) {
    resourceInfo.resourceType = 'user';
    resourceInfo.resourceId = params.id || params.userId || body.userId;
  } else if (path.includes('/file')) {
    resourceInfo.resourceType = 'file';
    resourceInfo.resourceId = params.id || params.fileId || body.fileId;
  } else if (path.includes('/inventory')) {
    resourceInfo.resourceType = 'inventory';
    resourceInfo.resourceId = params.sku || body.sku;
  } else if (path.includes('/payment')) {
    resourceInfo.resourceType = 'payment';
    resourceInfo.resourceId = params.id || params.paymentId || body.paymentId;
  }
  
  return resourceInfo;
};

// Helper function to sanitize metadata
const sanitizeMetadata = (data) => {
  if (!data || typeof data !== 'object') return {};
  
  const sanitized = { ...data };
  
  // Remove sensitive fields
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'hash', 'authorization',
    'cookie', 'session', 'csrf', 'signature', 'privateKey'
  ];
  
  const removeSensitiveFields = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (!sensitiveFields.some(field => lowerKey.includes(field))) {
        if (typeof value === 'object' && value !== null) {
          cleaned[key] = removeSensitiveFields(value);
        } else {
          // Truncate long strings
          cleaned[key] = typeof value === 'string' && value.length > 500 
            ? value.substring(0, 500) + '...' 
            : value;
        }
      }
    }
    return cleaned;
  };
  
  return removeSensitiveFields(sanitized);
};

/**
 * Main activity logging middleware
 * @param {Object} options - Configuration options
 * @param {Array} options.excludePaths - Paths to exclude from logging
 * @param {Array} options.includeActions - Specific actions to log (if provided, only these will be logged)
 * @param {Boolean} options.logFailures - Whether to log failed requests
 */
export const activityLogger = (options = {}) => {
  const {
    excludePaths = ['/health', '/metrics', '/favicon.ico'],
    includeActions = null,
    logFailures = true
  } = options;
  
  return async (req, res, next) => {
    // Skip logging for excluded paths
    if (excludePaths.some(path => req.path.includes(path))) {
      return next();
    }
    
    // Skip if no user context (for public endpoints)
    if (!req.user || !req.user.id) {
      return next();
    }
    
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || uuidv4();
    
    // Store original res.json to capture response
    const originalJson = res.json;
    let responseData = null;
    let statusCode = null;
    
    res.json = function(data) {
      responseData = data;
      statusCode = res.statusCode;
      return originalJson.call(this, data);
    };
    
    // Store original res.status to capture status changes
    const originalStatus = res.status;
    res.status = function(code) {
      statusCode = code;
      return originalStatus.call(this, code);
    };
    
    // Continue with the request
    next();
    
    // Log activity after response is sent
    res.on('finish', async () => {
      try {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const action = determineAction(req.method, req.path, req.body);
        
        // Skip if action is not in includeActions (when specified)
        if (includeActions && !includeActions.includes(action)) {
          return;
        }
        
        const resourceInfo = extractResourceInfo(req.path, req.body, req.params);
        
        // Determine result based on status code
        let result = 'success';
        if (statusCode >= 400) {
          result = 'failure';
          if (!logFailures) return; 
        } else if (statusCode >= 300) {
          result = 'partial';
        }
        
        // Prepare metadata
        const metadata = {
          method: req.method,
          path: req.path,
          query: sanitizeMetadata(req.query),
          statusCode,
          responseTime: duration,
          requestId
        };
        
        // Add request body for certain actions (excluding sensitive data)
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
          metadata.requestBody = sanitizeMetadata(req.body);
        }
        
        // Add response data for failures or specific actions
        if (result === 'failure' || ['login', 'logout'].includes(action)) {
          metadata.response = sanitizeMetadata(responseData);
        }
        
        // Add user agent and other headers
        if (req.headers['user-agent']) {
          metadata.userAgent = req.headers['user-agent'];
        }
        
        // Prepare activity log data
        const activityData = {
          userId: req.user.id,
          action,
          metadata,
          ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent'],
          result,
          duration,
          timestamp: new Date(startTime),
          requestId,
          sessionId: req.sessionID || req.headers['x-session-id'],
          ...resourceInfo
        };
        
        // Add error message for failures
        if (result === 'failure' && responseData && responseData.message) {
          activityData.errorMessage = responseData.message;
        }
        
        // Log the activity (non-blocking)
        await ActivityLog.logActivity(activityData);
        
      } catch (error) {
        // Don't let logging errors affect the main request
        console.error('Activity logging error:', error);
      }
    });
  };
};

/**
 * Specific middleware for authentication events
 */
export const authActivityLogger = async (req, action, result = 'success', metadata = {}) => {
  try {
    const activityData = {
      userId: req.user?.id || req.body?.userId || req.body?.email,
      action,
      metadata: {
        ...sanitizeMetadata(metadata),
        method: req.method,
        path: req.path,
        requestId: req.headers['x-request-id'] || uuidv4()
      },
      ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
      result,
      timestamp: new Date(),
      sessionId: req.sessionID || req.headers['x-session-id']
    };
    
    if (result === 'failure' && metadata.error) {
      activityData.errorMessage = metadata.error;
    }
    
    await ActivityLog.logActivity(activityData);
  } catch (error) {
    console.error('Auth activity logging error:', error);
  }
};

/**
 * Manual activity logging function for custom events
 */
export const logActivity = async (userId, action, metadata = {}, options = {}) => {
  try {
    const activityData = {
      userId,
      action,
      metadata: sanitizeMetadata(metadata),
      result: options.result || 'success',
      timestamp: new Date(),
      ...options
    };
    
    return await ActivityLog.logActivity(activityData);
  } catch (error) {
    console.error('Manual activity logging error:', error);
    return null;
  }
};

export default activityLogger;