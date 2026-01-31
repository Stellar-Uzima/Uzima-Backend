import ActivityLog from '../models/ActivityLog.js';
import mongoose from 'mongoose';

/**
 * Activity Log Service
 * Provides comprehensive functionality for recording and retrieving user activity logs
 */
class ActivityLogService {
  /**
   * Record a new activity log entry
   * @param {Object} activityData - Activity data to log
   * @returns {Promise<Object|null>} Created activity log or null if failed
   */
  static async logActivity(activityData) {
    try {
      const log = await ActivityLog.logActivity(activityData);
      return log;
    } catch (error) {
      console.error('ActivityLogService: Failed to log activity:', error);
      return null;
    }
  }

  /**
   * Get activity logs for a specific user with pagination and filtering
   * @param {String} userId - User ID to get logs for
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated activity logs
   */
  static async getUserActivityLogs(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        action = null,
        result = null,
        startDate = null,
        endDate = null,
        resourceType = null,
        sortBy = 'timestamp',
        sortOrder = 'desc',
      } = options;

      // Build query
      const query = { userId: new mongoose.Types.ObjectId(userId) };

      if (action) {
        if (Array.isArray(action)) {
          query.action = { $in: action };
        } else {
          query.action = action;
        }
      }

      if (result) {
        query.result = result;
      }

      if (resourceType) {
        query.resourceType = resourceType;
      }

      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const [logs, totalCount] = await Promise.all([
        ActivityLog.find(query)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('userId', 'username email role')
          .lean(),
        ActivityLog.countDocuments(query),
      ]);

      return {
        logs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNextPage: page * limit < totalCount,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error('ActivityLogService: Failed to get user activity logs:', error);
      throw new Error('Failed to retrieve activity logs');
    }
  }

  /**
   * Get activity logs for multiple users (admin function)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated activity logs
   */
  static async getActivityLogs(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        userId = null,
        action = null,
        result = null,
        startDate = null,
        endDate = null,
        resourceType = null,
        ipAddress = null,
        sortBy = 'timestamp',
        sortOrder = 'desc',
      } = options;

      // Build query
      const query = {};

      if (userId) {
        if (Array.isArray(userId)) {
          query.userId = { $in: userId.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
          query.userId = new mongoose.Types.ObjectId(userId);
        }
      }

      if (action) {
        if (Array.isArray(action)) {
          query.action = { $in: action };
        } else {
          query.action = action;
        }
      }

      if (result) {
        query.result = result;
      }

      if (resourceType) {
        query.resourceType = resourceType;
      }

      if (ipAddress) {
        query.ipAddress = ipAddress;
      }

      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const [logs, totalCount] = await Promise.all([
        ActivityLog.find(query)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('userId', 'username email role')
          .lean(),
        ActivityLog.countDocuments(query),
      ]);

      return {
        logs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNextPage: page * limit < totalCount,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error('ActivityLogService: Failed to get activity logs:', error);
      throw new Error('Failed to retrieve activity logs');
    }
  }

  /**
   * Get activity summary for a user
   * @param {String} userId - User ID
   * @param {Number} days - Number of days to look back
   * @returns {Promise<Array>} Activity summary
   */
  static async getUserActivitySummary(userId, days = 30) {
    try {
      return await ActivityLog.getUserActivitySummary(userId, days);
    } catch (error) {
      console.error('ActivityLogService: Failed to get user activity summary:', error);
      throw new Error('Failed to retrieve activity summary');
    }
  }

  /**
   * Get system-wide activity statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Activity statistics
   */
  static async getActivityStatistics(filters = {}) {
    try {
      const stats = await ActivityLog.getActivityStats(filters);
      return (
        stats[0] || {
          totalActivities: 0,
          uniqueUserCount: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 0,
          avgDuration: 0,
        }
      );
    } catch (error) {
      console.error('ActivityLogService: Failed to get activity statistics:', error);
      throw new Error('Failed to retrieve activity statistics');
    }
  }

  /**
   * Get activity trends over time
   * @param {Object} options - Options for trend analysis
   * @returns {Promise<Array>} Activity trends
   */
  static async getActivityTrends(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate = new Date(),
        groupBy = 'day', // day, hour, week, month
        action = null,
        userId = null,
      } = options;

      // Build match stage
      const matchStage = {
        timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
      };

      if (action) {
        matchStage.action = action;
      }

      if (userId) {
        matchStage.userId = new mongoose.Types.ObjectId(userId);
      }

      // Build group stage based on groupBy parameter
      let groupStage;
      switch (groupBy) {
        case 'hour':
          groupStage = {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' },
              hour: { $hour: '$timestamp' },
            },
          };
          break;
        case 'week':
          groupStage = {
            _id: {
              year: { $year: '$timestamp' },
              week: { $week: '$timestamp' },
            },
          };
          break;
        case 'month':
          groupStage = {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
            },
          };
          break;
        default: // day
          groupStage = {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' },
            },
          };
      }

      groupStage.count = { $sum: 1 };
      groupStage.successCount = {
        $sum: { $cond: [{ $eq: ['$result', 'success'] }, 1, 0] },
      };
      groupStage.failureCount = {
        $sum: { $cond: [{ $eq: ['$result', 'failure'] }, 1, 0] },
      };
      groupStage.uniqueUsers = { $addToSet: '$userId' };

      const trends = await ActivityLog.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        {
          $project: {
            _id: 1,
            count: 1,
            successCount: 1,
            failureCount: 1,
            uniqueUserCount: { $size: '$uniqueUsers' },
            successRate: {
              $multiply: [{ $divide: ['$successCount', '$count'] }, 100],
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return trends;
    } catch (error) {
      console.error('ActivityLogService: Failed to get activity trends:', error);
      throw new Error('Failed to retrieve activity trends');
    }
  }

  /**
   * Get top actions by frequency
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Top actions
   */
  static async getTopActions(options = {}) {
    try {
      const { limit = 10, startDate = null, endDate = null, userId = null } = options;

      const matchStage = {};

      if (startDate || endDate) {
        matchStage.timestamp = {};
        if (startDate) matchStage.timestamp.$gte = new Date(startDate);
        if (endDate) matchStage.timestamp.$lte = new Date(endDate);
      }

      if (userId) {
        matchStage.userId = new mongoose.Types.ObjectId(userId);
      }

      const topActions = await ActivityLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ['$result', 'success'] }, 1, 0] },
            },
            failureCount: {
              $sum: { $cond: [{ $eq: ['$result', 'failure'] }, 1, 0] },
            },
            uniqueUsers: { $addToSet: '$userId' },
            lastOccurrence: { $max: '$timestamp' },
          },
        },
        {
          $project: {
            action: '$_id',
            count: 1,
            successCount: 1,
            failureCount: 1,
            uniqueUserCount: { $size: '$uniqueUsers' },
            successRate: {
              $multiply: [{ $divide: ['$successCount', '$count'] }, 100],
            },
            lastOccurrence: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: parseInt(limit) },
      ]);

      return topActions;
    } catch (error) {
      console.error('ActivityLogService: Failed to get top actions:', error);
      throw new Error('Failed to retrieve top actions');
    }
  }

  /**
   * Get suspicious activity patterns
   * @param {Object} options - Detection options
   * @returns {Promise<Array>} Suspicious activities
   */
  static async getSuspiciousActivity(options = {}) {
    try {
      const {
        timeWindow = 60, // minutes
        failureThreshold = 5,
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      } = options;

      // Find users with high failure rates
      const suspiciousUsers = await ActivityLog.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate },
            result: 'failure',
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              ipAddress: '$ipAddress',
            },
            failureCount: { $sum: 1 },
            actions: { $addToSet: '$action' },
            timeRange: {
              $push: '$timestamp',
            },
          },
        },
        {
          $match: {
            failureCount: { $gte: failureThreshold },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id.userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $project: {
            userId: '$_id.userId',
            ipAddress: '$_id.ipAddress',
            failureCount: 1,
            actions: 1,
            user: { $arrayElemAt: ['$user', 0] },
            firstFailure: { $min: '$timeRange' },
            lastFailure: { $max: '$timeRange' },
          },
        },
        { $sort: { failureCount: -1 } },
      ]);

      return suspiciousUsers;
    } catch (error) {
      console.error('ActivityLogService: Failed to get suspicious activity:', error);
      throw new Error('Failed to retrieve suspicious activity');
    }
  }

  /**
   * Export activity logs to CSV format
   * @param {Object} filters - Export filters
   * @returns {Promise<String>} CSV data
   */
  static async exportActivityLogs(filters = {}) {
    try {
      const { logs } = await this.getActivityLogs({
        ...filters,
        limit: 10000, // Large limit for export
        page: 1,
      });

      if (logs.length === 0) {
        return 'No data to export';
      }

      // CSV headers
      const headers = [
        'Timestamp',
        'User ID',
        'Username',
        'Action',
        'Result',
        'IP Address',
        'Resource Type',
        'Resource ID',
        'Duration (ms)',
        'Error Message',
      ];

      // Convert logs to CSV rows
      const rows = logs.map(log => [
        log.timestamp.toISOString(),
        log.userId._id,
        log.userId.username || '',
        log.action,
        log.result,
        log.ipAddress || '',
        log.resourceType || '',
        log.resourceId || '',
        log.duration || '',
        log.errorMessage || '',
      ]);

      // Combine headers and rows
      const csvData = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      return csvData;
    } catch (error) {
      console.error('ActivityLogService: Failed to export activity logs:', error);
      throw new Error('Failed to export activity logs');
    }
  }

  /**
   * Clean up old activity logs based on retention policy
   * @param {Number} retentionDays - Number of days to retain logs
   * @returns {Promise<Object>} Cleanup results
   */
  static async cleanupOldLogs(retentionDays = 90) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await ActivityLog.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      return {
        deletedCount: result.deletedCount,
        cutoffDate,
      };
    } catch (error) {
      console.error('ActivityLogService: Failed to cleanup old logs:', error);
      throw new Error('Failed to cleanup old logs');
    }
  }
}

export default ActivityLogService;
