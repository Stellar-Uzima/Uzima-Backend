import express from 'express';
import AuditLog from '../models/AuditLog.js';
import protect from '../middleware/authMiddleware.js';
import hasPermission from '../middleware/rbac.js';

const router = express.Router();

// Get audit logs for a specific resource
router.get(
  '/resource/:resourceType/:resourceId',
  protect,
  hasPermission('view_audit_logs'),
  async (req, res) => {
    try {
      const { resourceType, resourceId } = req.params;
      const { startDate, endDate, action, page = 1, limit = 50 } = req.query;

      const query = { resourceType, resourceId };

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      if (action) query.action = action;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .populate('userId', 'name email')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        AuditLog.countDocuments(query),
      ]);

      res.json({
        success: true,
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching resource audit logs:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
    }
  }
);

// Get audit logs for a specific user
router.get('/user/:userId', protect, hasPermission('view_audit_logs'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, action, resourceType, page = 1, limit = 50 } = req.query;

    const query = { userId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

// Get all audit logs with filtering
router.get('/', protect, hasPermission('view_audit_logs'), async (req, res) => {
  try {
    const { startDate, endDate, action, resourceType, userId, page = 1, limit = 50 } = req.query;

    const query = {};

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;
    if (userId) query.userId = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

// Get audit statistics
router.get('/stats', protect, hasPermission('view_audit_logs'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate);
    }

    const stats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
    ]);

    const resourceStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$resourceType',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      actionStats: stats,
      resourceStats,
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit statistics' });
  }
});

export default router;

// USAGE EXAMPLE - Add to your routes
/*
import { auditLog, captureBeforeState } from '../middleware/auditMiddleware.js';
import User from '../models/User.js';

// Example: User routes with audit logging
router.post('/users', 
  protect, 
  auditLog('User'),
  createUser
);

router.put('/users/:id', 
  protect,
  captureBeforeState(User),
  auditLog('User'),
  updateUser
);

router.delete('/users/:id',
  protect,
  captureBeforeState(User),
  auditLog('User'),
  deleteUser
);

router.get('/users/:id',
  protect,
  auditLog('User'),
  getUser
);
*/
