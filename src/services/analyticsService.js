import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import cacheHelper from '../utils/cacheHelper.js';

/**
 * Service to handle analytics data aggregation and processing
 */
export const analyticsService = {
  /**
   * Calculate growth percentage between current and previous period
   * @param {number} current - Current value
   * @param {number} previous - Previous value
   * @returns {string} - Growth percentage as string (e.g., "+10.5%") or "N/A"
   */
  calculateGrowth(current, previous) {
    if (previous === 0) {
      return current > 0 ? '+100%' : '0%';
    }

    const growth = ((current - previous) / previous) * 100;
    const sign = growth >= 0 ? '+' : '';
    return `${sign}${growth.toFixed(1)}%`;
  },

  /**
   * Get previous period date range based on current range duration
   * @param {Date} startDate - Current start date
   * @param {Date} endDate - Current end date
   * @returns {Object} - { startDate, endDate } for previous period
   */
  getPreviousPeriod(startDate, endDate) {
    const duration = endDate.getTime() - startDate.getTime();
    const prevEndDate = new Date(startDate.getTime());
    const prevStartDate = new Date(prevEndDate.getTime() - duration);

    return { startDate: prevStartDate, endDate: prevEndDate };
  },

  /**
   * Get user analytics with caching and comparison
   * @param {Date} startDate
   * @param {Date} endDate
   */
  async getUserAnalytics(startDate, endDate) {
    const cacheKey = cacheHelper.generateKey('users', { startDate, endDate });
    const cachedData = await cacheHelper.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    // Get previous period dates for comparison
    const prevPeriod = this.getPreviousPeriod(startDate, endDate);

    // Parallel execution of all user-related queries
    const [
      totalUsers,
      activeUsers,
      newRegistrations,
      roleDistribution,
      registrationTrend,
      // Previous period data for comparison
      prevNewRegistrations,
      prevActiveUsers
    ] = await Promise.all([
      User.getTotalUserCount(endDate),
      User.getTotalUserCount(endDate), // Using total count as proxy for active if log not available, improved below
      User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      User.getRoleDistribution(),
      User.getRegistrationTrends(startDate, endDate),
      // Comparison queries
      User.countDocuments({ createdAt: { $gte: prevPeriod.startDate, $lte: prevPeriod.endDate } }),
      User.getTotalUserCount(prevPeriod.endDate) // Simplified comparison
    ]);

    // Get true active users from ActivityLog if possible
    let trueActiveUsers = 0;
    let prevTrueActiveUsers = 0;

    try {
      const activeStats = await ActivityLog.getActivityStats({ startDate, endDate });
      if (activeStats && activeStats.length > 0) {
        trueActiveUsers = activeStats[0].uniqueUserCount;
      }

      const prevActiveStats = await ActivityLog.getActivityStats({
        startDate: prevPeriod.startDate,
        endDate: prevPeriod.endDate
      });
      if (prevActiveStats && prevActiveStats.length > 0) {
        prevTrueActiveUsers = prevActiveStats[0].uniqueUserCount;
      }
    } catch (err) {
      console.warn('Failed to get active user stats from logs, using fallback', err);
    }

    const result = {
      summary: {
        totalUsers,
        activeUsers: trueActiveUsers,
        newRegistrations,
        growth: {
          registrations: this.calculateGrowth(newRegistrations, prevNewRegistrations),
          activeUsers: this.calculateGrowth(trueActiveUsers, prevTrueActiveUsers)
        }
      },
      roles: roleDistribution,
      trends: registrationTrend
    };

    // Cache result
    await cacheHelper.set(cacheKey, result);

    return result;
  },

  /**
   * Get activity analytics
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {string} actionFilter - Optional action type filter
   */
  async getActivityAnalytics(startDate, endDate, actionFilter) {
    const cacheKey = cacheHelper.generateKey('activity', { startDate, endDate, actionFilter });
    const cachedData = await cacheHelper.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const prevPeriod = this.getPreviousPeriod(startDate, endDate);

    const [
      trends,
      stats,
      prevStats
    ] = await Promise.all([
      ActivityLog.getActionTrendsOverTime(startDate, endDate),
      ActivityLog.getActivityStats({ startDate, endDate, action: actionFilter }),
      ActivityLog.getActivityStats({
        startDate: prevPeriod.startDate,
        endDate: prevPeriod.endDate,
        action: actionFilter
      })
    ]);

    const currentStats = stats[0] || { totalActivities: 0, successCount: 0, failureCount: 0 };
    const previousStats = prevStats[0] || { totalActivities: 0 };

    const trendData = trends[0] || { dailyTrend: [], actionBreakdown: [], topUsers: [] };

    const result = {
      summary: {
        totalActions: currentStats.totalActivities,
        successRate: parseFloat(currentStats.successRate || 0).toFixed(2) + '%',
        growth: {
          actions: this.calculateGrowth(currentStats.totalActivities, previousStats.totalActivities)
        }
      },
      breakdown: trendData.actionBreakdown,
      topUsers: trendData.topUsers,
      timeline: trendData.dailyTrend
    };

    await cacheHelper.set(cacheKey, result);

    return result;
  },

  /**
   * Get performance analytics
   * @param {Date} startDate
   * @param {Date} endDate
   */
  async getPerformanceAnalytics(startDate, endDate) {
    const cacheKey = cacheHelper.generateKey('performance', { startDate, endDate });
    const cachedData = await cacheHelper.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const prevPeriod = this.getPreviousPeriod(startDate, endDate);

    const [
      metrics,
      prevMetricsArray
    ] = await Promise.all([
      ActivityLog.getPerformanceMetrics(startDate, endDate),
      ActivityLog.getPerformanceMetrics(prevPeriod.startDate, prevPeriod.endDate)
    ]);

    const currentMetrics = metrics[0] || { overall: [], distribution: [], slowestActions: [] };
    const prevMetrics = (prevMetricsArray[0] && prevMetricsArray[0].overall[0]) || { avgDuration: 0 };

    const overall = currentMetrics.overall[0] || { avgDuration: 0, minDuration: 0, maxDuration: 0, totalRequests: 0 };

    // Inverse growth for latency (lower is better)
    const latencyChange = this.calculateGrowth(overall.avgDuration, prevMetrics.avgDuration);

    const result = {
      summary: {
        avgResponseTime: Math.round(overall.avgDuration) + 'ms',
        minResponseTime: overall.minDuration + 'ms',
        maxResponseTime: overall.maxDuration + 'ms',
        totalRequests: overall.totalRequests,
        comparison: latencyChange
      },
      distribution: currentMetrics.distribution,
      slowestEndpoints: currentMetrics.slowestActions
    };

    await cacheHelper.set(cacheKey, result);

    return result;
  },

  /**
   * Get error analytics
   * @param {Date} startDate
   * @param {Date} endDate
   */
  async getErrorAnalytics(startDate, endDate) {
    const cacheKey = cacheHelper.generateKey('errors', { startDate, endDate });
    const cachedData = await cacheHelper.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const prevPeriod = this.getPreviousPeriod(startDate, endDate);

    const [
      errorStats,
      prevErrorActivity,
      totalActivity // Need total to calculate rate
    ] = await Promise.all([
      ActivityLog.getErrorAnalytics(startDate, endDate),
      ActivityLog.getErrorAnalytics(prevPeriod.startDate, prevPeriod.endDate),
      ActivityLog.countDocuments({ timestamp: { $gte: startDate, $lte: endDate } })
    ]);

    const currentErrors = errorStats[0] || { trend: [], byAction: [], topMessages: [] };

    // Calculate total errors from breakdown
    const totalErrors = currentErrors.byAction.reduce((sum, item) => sum + item.count, 0);

    // Calculate previous errors (approximate from trend if needed or do proper count)
    const prevErrors = (prevErrorActivity[0]?.byAction || []).reduce((sum, item) => sum + item.count, 0);

    const errorRate = totalActivity > 0 ? ((totalErrors / totalActivity) * 100).toFixed(2) : 0;

    const result = {
      summary: {
        totalErrors,
        errorRate: errorRate + '%',
        growth: this.calculateGrowth(totalErrors, prevErrors)
      },
      byType: currentErrors.byAction,
      topErrors: currentErrors.topMessages,
      timeline: currentErrors.trend
    };

    await cacheHelper.set(cacheKey, result);

    return result;
  }
};

export default analyticsService;
