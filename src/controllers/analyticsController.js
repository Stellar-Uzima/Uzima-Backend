import { analyticsService } from '../services/analyticsService.js';

/**
 * Controller for Admin Analytics
 */

// Helper to parse date params
const parseDateParams = (query) => {
  const endDate = query.endDate ? new Date(query.endDate) : new Date();

  // Default to 30 days ago if no start date
  let startDate = query.startDate ? new Date(query.startDate) : new Date();
  if (!query.startDate) {
    startDate.setDate(endDate.getDate() - 30);
  }

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid date format');
  }

  return { startDate, endDate };
};

export const analyticsController = {
  /**
   * Get User Analytics
   * @route GET /api/admin/analytics/users
   */
  async getUserAnalytics(req, res) {
    try {
      const { startDate, endDate } = parseDateParams(req.query);

      const data = await analyticsService.getUserAnalytics(startDate, endDate);

      res.status(200).json({
        success: true,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        data
      });
    } catch (error) {
      console.error('User analytics error:', error);
      res.status(error.message === 'Invalid date format' ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to retrieve user analytics'
      });
    }
  },

  /**
   * Get Activity Analytics
   * @route GET /api/admin/analytics/activity
   */
  async getActivityAnalytics(req, res) {
    try {
      const { startDate, endDate } = parseDateParams(req.query);
      const { action } = req.query;

      const data = await analyticsService.getActivityAnalytics(startDate, endDate, action);

      res.status(200).json({
        success: true,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        filters: { action },
        data
      });
    } catch (error) {
      console.error('Activity analytics error:', error);
      res.status(error.message === 'Invalid date format' ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to retrieve activity analytics'
      });
    }
  },

  /**
   * Get Performance Analytics
   * @route GET /api/admin/analytics/performance
   */
  async getPerformanceAnalytics(req, res) {
    try {
      const { startDate, endDate } = parseDateParams(req.query);

      const data = await analyticsService.getPerformanceAnalytics(startDate, endDate);

      res.status(200).json({
        success: true,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        data
      });
    } catch (error) {
      console.error('Performance analytics error:', error);
      res.status(error.message === 'Invalid date format' ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to retrieve performance analytics'
      });
    }
  },

  /**
   * Get Error Analytics
   * @route GET /api/admin/analytics/errors
   */
  async getErrorAnalytics(req, res) {
    try {
      const { startDate, endDate } = parseDateParams(req.query);

      const data = await analyticsService.getErrorAnalytics(startDate, endDate);

      res.status(200).json({
        success: true,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        data
      });
    } catch (error) {
      console.error('Error analytics error:', error);
      res.status(error.message === 'Invalid date format' ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to retrieve error analytics'
      });
    }
  }
};

export default analyticsController;
