import ActivityLogService from '../services/activityLogService.js';
import mongoose from 'mongoose';

/**
 * Activity Log Controller
 * Handles API endpoints for activity log management
 */

/**
 * Get activity logs for a specific user
 * @route GET /activity/:userId
 * @access Private (admin, super_admin, or own user)
 */
export const getUserActivityLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 20,
      action,
      result,
      startDate,
      endDate,
      resourceType,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = req.query;

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
    }

    // Check authorization - users can only view their own logs unless they're admin
    const requestingUser = req.user;
    const requestingUserId = requestingUser?._id?.toString() || requestingUser?.id?.toString();
    const isAdmin = ['admin', 'super_admin'].includes(requestingUser?.role);
    const isOwnUser = requestingUserId === userId;

    if (!isAdmin && !isOwnUser) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own activity logs.',
      });
    }

    // Parse action filter if provided
    let actionFilter = null;
    if (action) {
      actionFilter = action.includes(',') ? action.split(',') : action;
    }

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Cap at 100 per page
      action: actionFilter,
      result,
      startDate,
      endDate,
      resourceType,
      sortBy,
      sortOrder,
    };

    const result_data = await ActivityLogService.getUserActivityLogs(userId, options);

    res.status(200).json({
      success: true,
      message: 'Activity logs retrieved successfully',
      data: result_data,
    });
  } catch (error) {
    console.error('getUserActivityLogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve activity logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get activity logs for all users (admin only)
 * @route GET /admin/activity
 * @access Private (admin, super_admin)
 */
export const getAllActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      action,
      result,
      startDate,
      endDate,
      resourceType,
      ipAddress,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = req.query;

    // Parse filters
    let userIdFilter = null;
    if (userId) {
      if (userId.includes(',')) {
        userIdFilter = userId.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
      } else if (mongoose.Types.ObjectId.isValid(userId)) {
        userIdFilter = userId;
      }
    }

    let actionFilter = null;
    if (action) {
      actionFilter = action.includes(',') ? action.split(',') : action;
    }

    const options = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Cap at 100 per page
      userId: userIdFilter,
      action: actionFilter,
      result,
      startDate,
      endDate,
      resourceType,
      ipAddress,
      sortBy,
      sortOrder,
    };

    const result_data = await ActivityLogService.getActivityLogs(options);

    res.status(200).json({
      success: true,
      message: 'Activity logs retrieved successfully',
      data: result_data,
    });
  } catch (error) {
    console.error('getAllActivityLogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve activity logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get activity summary for a user
 * @route GET /activity/:userId/summary
 * @access Private (admin, super_admin, or own user)
 */
export const getUserActivitySummary = async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
    }

    // Check authorization
    const requestingUser = req.user;
    const isAdmin = ['admin', 'super_admin'].includes(requestingUser.role);
    const isOwnUser = requestingUser._id.toString() === userId;

    if (!isAdmin && !isOwnUser) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own activity summary.',
      });
    }

    const summary = await ActivityLogService.getUserActivitySummary(userId, parseInt(days));

    res.status(200).json({
      success: true,
      message: 'Activity summary retrieved successfully',
      data: {
        userId,
        days: parseInt(days),
        summary,
      },
    });
  } catch (error) {
    console.error('getUserActivitySummary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve activity summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get system-wide activity statistics (admin only)
 * @route GET /admin/activity/statistics
 * @access Private (admin, super_admin)
 */
export const getActivityStatistics = async (req, res) => {
  try {
    const { startDate, endDate, action, result } = req.query;

    const filters = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (action) filters.action = action;
    if (result) filters.result = result;

    const statistics = await ActivityLogService.getActivityStatistics(filters);

    res.status(200).json({
      success: true,
      message: 'Activity statistics retrieved successfully',
      data: statistics,
    });
  } catch (error) {
    console.error('getActivityStatistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve activity statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get activity trends over time (admin only)
 * @route GET /admin/activity/trends
 * @access Private (admin, super_admin)
 */
export const getActivityTrends = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day', action, userId } = req.query;

    // Validate groupBy parameter
    const validGroupBy = ['hour', 'day', 'week', 'month'];
    if (!validGroupBy.includes(groupBy)) {
      return res.status(400).json({
        success: false,
        message: `Invalid groupBy parameter. Must be one of: ${validGroupBy.join(', ')}`,
      });
    }

    const options = {
      groupBy,
      action,
      userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
    };

    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const trends = await ActivityLogService.getActivityTrends(options);

    res.status(200).json({
      success: true,
      message: 'Activity trends retrieved successfully',
      data: {
        trends,
        groupBy,
        period: {
          startDate: options.startDate,
          endDate: options.endDate,
        },
      },
    });
  } catch (error) {
    console.error('getActivityTrends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve activity trends',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get top actions by frequency (admin only)
 * @route GET /admin/activity/top-actions
 * @access Private (admin, super_admin)
 */
export const getTopActions = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate, userId } = req.query;

    const options = {
      limit: Math.min(parseInt(limit), 50), // Cap at 50
      userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
    };

    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const topActions = await ActivityLogService.getTopActions(options);

    res.status(200).json({
      success: true,
      message: 'Top actions retrieved successfully',
      data: topActions,
    });
  } catch (error) {
    console.error('getTopActions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve top actions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get suspicious activity patterns (admin only)
 * @route GET /admin/activity/suspicious
 * @access Private (admin, super_admin)
 */
export const getSuspiciousActivity = async (req, res) => {
  try {
    const { timeWindow = 60, failureThreshold = 5, startDate } = req.query;

    const options = {
      timeWindow: parseInt(timeWindow),
      failureThreshold: parseInt(failureThreshold),
    };

    if (startDate) {
      options.startDate = new Date(startDate);
    }

    const suspiciousActivity = await ActivityLogService.getSuspiciousActivity(options);

    res.status(200).json({
      success: true,
      message: 'Suspicious activity retrieved successfully',
      data: {
        suspiciousUsers: suspiciousActivity,
        criteria: {
          timeWindow: options.timeWindow,
          failureThreshold: options.failureThreshold,
          startDate: options.startDate,
        },
      },
    });
  } catch (error) {
    console.error('getSuspiciousActivity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve suspicious activity',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Export activity logs to CSV (admin only)
 * @route GET /admin/activity/export
 * @access Private (admin, super_admin)
 */
export const exportActivityLogs = async (req, res) => {
  try {
    const { userId, action, result, startDate, endDate, resourceType, ipAddress } = req.query;

    // Parse filters
    let userIdFilter = null;
    if (userId) {
      if (userId.includes(',')) {
        userIdFilter = userId.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
      } else if (mongoose.Types.ObjectId.isValid(userId)) {
        userIdFilter = userId;
      }
    }

    let actionFilter = null;
    if (action) {
      actionFilter = action.includes(',') ? action.split(',') : action;
    }

    const filters = {
      userId: userIdFilter,
      action: actionFilter,
      result,
      startDate,
      endDate,
      resourceType,
      ipAddress,
    };

    const csvData = await ActivityLogService.exportActivityLogs(filters);

    // Set CSV headers
    const filename = `activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.status(200).send(csvData);
  } catch (error) {
    console.error('exportActivityLogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export activity logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Manually log an activity (admin only)
 * @route POST /admin/activity
 * @access Private (admin, super_admin)
 */
export const logActivity = async (req, res) => {
  try {
    const {
      userId,
      action,
      metadata = {},
      resourceType,
      resourceId,
      result = 'success',
      errorMessage,
    } = req.body;

    // Validate required fields
    if (!userId || !action) {
      return res.status(400).json({
        success: false,
        message: 'userId and action are required fields',
      });
    }

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
    }

    const activityData = {
      userId,
      action,
      metadata,
      resourceType,
      resourceId,
      result,
      errorMessage,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID,
      requestId: req.id,
    };

    const log = await ActivityLogService.logActivity(activityData);

    if (!log) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create activity log',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Activity logged successfully',
      data: log,
    });
  } catch (error) {
    console.error('logActivity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log activity',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
