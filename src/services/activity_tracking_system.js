// ============================================
// 1. ACTIVITY LOG MODEL (models/ActivityLog.js)
// ============================================
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: ['login', 'logout', 'create', 'update', 'delete', 'view', 'download', 'upload'],
    index: true
  },
  resource: {
    type: String,
    required: true,
    index: true
  },
  resourceId: {
    type: String,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  statusCode: {
    type: Number
  },
  duration: {
    type: Number // milliseconds
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  archived: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'activity_logs'
});

// Compound indexes for common queries
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1, archived: 1 });
activityLogSchema.index({ archived: 1, timestamp: 1 });

// TTL index for auto-deletion of archived logs after 365 days
activityLogSchema.index(
  { timestamp: 1 },
  { 
    expireAfterSeconds: 31536000, // 365 days
    partialFilterExpression: { archived: true }
  }
);

// Static method for archiving old logs
activityLogSchema.statics.archiveOldLogs = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await this.updateMany(
    { 
      timestamp: { $lt: cutoffDate },
      archived: false
    },
    { 
      $set: { archived: true }
    }
  );
  
  return result;
};

// Static method for bulk insert (for queue processing)
activityLogSchema.statics.bulkInsertLogs = async function(logs) {
  return await this.insertMany(logs, { ordered: false });
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);

// ============================================
// 2. ACTIVITY LOGGER SERVICE (services/activityLogger.js)
// ============================================
const ActivityLog = require('../models/ActivityLog');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

// Create BullMQ queue for async log processing
const activityQueue = new Queue('activity-logs', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

class ActivityLogger {
  static async log(logData) {
    try {
      // Add to queue for async processing
      await activityQueue.add('log-activity', logData, {
        priority: logData.action === 'login' ? 1 : 3
      });
    } catch (error) {
      console.error('Failed to queue activity log:', error);
      // Fallback: direct insert
      try {
        await ActivityLog.create(logData);
      } catch (dbError) {
        console.error('Failed to directly log activity:', dbError);
      }
    }
  }

  static extractClientInfo(req) {
    return {
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown'
    };
  }

  static async getUserActivity(userId, filters = {}) {
    const query = { userId, archived: false };
    
    if (filters.action) {
      query.action = filters.action;
    }
    
    if (filters.resource) {
      query.resource = filters.resource;
    }
    
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.timestamp.$lte = new Date(filters.endDate);
      }
    }
    
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 50;
    const skip = (page - 1) * limit;
    
    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      ActivityLog.countDocuments(query)
    ]);
    
    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async getRecentActivity(limit = 100, filters = {}) {
    const query = { archived: false };
    
    if (filters.action) {
      query.action = filters.action;
    }
    
    if (filters.userId) {
      query.userId = filters.userId;
    }
    
    return await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .select('-__v')
      .lean();
  }

  static async getActivityStats(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await ActivityLog.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          timestamp: { $gte: startDate },
          archived: false
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    return stats;
  }
}

module.exports = ActivityLogger;

// ============================================
// 3. ACTIVITY LOGGING MIDDLEWARE (middleware/activityLogger.js)
// ============================================
// ActivityLogger is already defined above in this file
const jwt = require('jsonwebtoken');

const activityLoggerMiddleware = (options = {}) => {
  const {
    excludePaths = ['/health', '/metrics', '/favicon.ico'],
    excludeActions = [],
    captureRequestBody = false,
    captureResponseBody = false
  } = options;

  return async (req, res, next) => {
    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const startTime = Date.now();
    
    // Extract user from JWT token
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId || decoded.id;
        req.userId = userId; // Attach to request for downstream use
      } catch (error) {
        // Invalid token, continue without userId
      }
    }

    // Capture original res.json
    const originalJson = res.json.bind(res);
    let responseBody;

    res.json = function(body) {
      responseBody = body;
      return originalJson(body);
    };

    // Wait for response to finish
    res.on('finish', async () => {
      // Only log if user is authenticated (except for login/logout)
      const isAuthAction = ['login', 'logout'].includes(getActionFromRequest(req));
      
      if (!userId && !isAuthAction) {
        return;
      }

      const action = getActionFromRequest(req);
      
      if (excludeActions.includes(action)) {
        return;
      }

      const clientInfo = ActivityLogger.extractClientInfo(req);
      const duration = Date.now() - startTime;

      const logData = {
        userId: userId || 'anonymous',
        action,
        resource: getResourceFromRequest(req),
        resourceId: req.params.id || req.body?.id || null,
        metadata: {
          method: req.method,
          path: req.path,
          query: req.query,
          ...(captureRequestBody && req.body ? { requestBody: sanitizeBody(req.body) } : {}),
          ...(captureResponseBody && responseBody ? { responseBody: sanitizeBody(responseBody) } : {})
        },
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date()
      };

      await ActivityLogger.log(logData);
    });

    next();
  };
};

function getActionFromRequest(req) {
  // Check for explicit action in request
  if (req.activityAction) {
    return req.activityAction;
  }

  // Infer from path
  if (req.path.includes('/login')) return 'login';
  if (req.path.includes('/logout')) return 'logout';
  if (req.path.includes('/download')) return 'download';
  if (req.path.includes('/upload')) return 'upload';

  // Infer from HTTP method
  switch (req.method) {
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    case 'GET': return 'view';
    default: return 'view';
  }
}

function getResourceFromRequest(req) {
  if (req.activityResource) {
    return req.activityResource;
  }

  // Extract from path (e.g., /api/users/123 -> users)
  const pathParts = req.path.split('/').filter(Boolean);
  return pathParts[1] || pathParts[0] || 'unknown';
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'privateKey'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

module.exports = activityLoggerMiddleware;

// ============================================
// 4. ACTIVITY ROUTES (routes/activity.js)
// ============================================
const express = require('express');
const router = express.Router();
// ActivityLogger is already defined above in this file
const ActivityLog = require('../models/ActivityLog');
const Joi = require('joi');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

// Validation schemas
const querySchema = Joi.object({
  action: Joi.string().valid('login', 'logout', 'create', 'update', 'delete', 'view', 'download', 'upload'),
  resource: Joi.string(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(50)
});

// GET /activity/user/:userId - Get activity logs for specific user
router.get('/user/:userId', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only view their own logs unless they're admin
    if (req.userId !== userId && !req.userRoles?.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot access other user activity logs'
      });
    }

    const { error, value: filters } = querySchema.validate(req.query);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(d => d.message)
      });
    }

    const result = await ActivityLogger.getUserActivity(userId, filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs'
    });
  }
});

// GET /activity/recent - Get recent activity (last 100 actions)
router.get('/recent', authenticateJWT, authorizeRoles('admin', 'auditor'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const filters = {
      action: req.query.action,
      userId: req.query.userId
    };

    const logs = await ActivityLogger.getRecentActivity(limit, filters);

    res.json({
      success: true,
      data: {
        logs,
        count: logs.length
      }
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity'
    });
  }
});

// GET /activity/stats/:userId - Get activity statistics
router.get('/stats/:userId', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    const days = parseInt(req.query.days) || 30;

    if (req.userId !== userId && !req.userRoles?.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot access other user statistics'
      });
    }

    const stats = await ActivityLogger.getActivityStats(userId, days);

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics'
    });
  }
});

// POST /activity/archive - Archive old logs (admin only)
router.post('/archive', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const daysOld = parseInt(req.body.daysOld) || 90;
    
    const result = await ActivityLog.archiveOldLogs(daysOld);

    res.json({
      success: true,
      message: `Successfully archived logs older than ${daysOld} days`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error archiving logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive logs'
    });
  }
});

// GET /activity/export - Export activity logs (admin only)
router.get('/export', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    const query = { archived: false };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .populate('userId', 'name email')
      .lean();

    if (format === 'csv') {
      const csv = convertToCSV(logs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=activity-logs.csv');
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: logs
      });
    }
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export logs'
    });
  }
});

function convertToCSV(logs) {
  const headers = ['Timestamp', 'User ID', 'Action', 'Resource', 'IP Address', 'Status Code'];
  const rows = logs.map(log => [
    log.timestamp.toISOString(),
    log.userId?._id || log.userId,
    log.action,
    log.resource,
    log.ipAddress,
    log.statusCode
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

module.exports = router;

// ============================================
// 5. BULLMQ WORKER (workers/activityLogWorker.js)
// ============================================
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const ActivityLog = require('../models/ActivityLog');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null
});

const worker = new Worker('activity-logs', async (job) => {
  const { data } = job;
  
  try {
    await ActivityLog.create(data);
    return { success: true };
  } catch (error) {
    console.error('Failed to process activity log:', error);
    throw error;
  }
}, {
  connection: redis,
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000
  }
});

worker.on('completed', (job) => {
  console.log(`Activity log processed: ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Activity log failed: ${job.id}`, err);
});

module.exports = worker;

// ============================================
// 6. EXPRESS APP INTEGRATION (app.js example)
// ============================================
/*
const express = require('express');
const mongoose = require('mongoose');
const activityLoggerMiddleware = require('./middleware/activityLogger');
const activityRoutes = require('./routes/activity');
const activityLogWorker = require('./workers/activityLogWorker');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Middleware
app.use(express.json());

// Apply activity logging middleware globally
app.use(activityLoggerMiddleware({
  excludePaths: ['/health', '/metrics', '/favicon.ico'],
  captureRequestBody: false, // Set to true for debugging
  captureResponseBody: false
}));

// Routes
app.use('/api/activity', activityRoutes);

// Other routes...
app.use('/api/users', require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));

// Scheduled archiving job (using node-cron or similar)
const cron = require('node-cron');
const ActivityLog = require('./models/ActivityLog');

// Archive logs older than 90 days every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running scheduled log archiving...');
  try {
    const result = await ActivityLog.archiveOldLogs(90);
    console.log(`Archived ${result.modifiedCount} logs`);
  } catch (error) {
    console.error('Failed to archive logs:', error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Activity logging system initialized');
});
*/