import express from 'express';
import {
  getTimingData,
  getSlowestEndpoints,
  exportTimingData,
  getPerformanceTrends,
  clearTimingData,
} from '../middleware/responseTimeMonitor.js';
import requireRoles from '../middleware/requireRole.js';

const router = express.Router();

/**
 * Get current timing data
 * GET /api/performance/timing
 */
router.get('/timing', requireRoles(['admin', 'monitoring']), (req, res) => {
  try {
    const data = getTimingData();
    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get slowest endpoints
 * GET /api/performance/slowest
 */
router.get('/slowest', requireRoles(['admin', 'monitoring']), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const slowest = getSlowestEndpoints(limit);
    res.json({
      success: true,
      data: slowest,
      count: slowest.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get performance trends
 * GET /api/performance/trends
 */
router.get('/trends', requireRoles(['admin', 'monitoring']), (req, res) => {
  try {
    const trends = getPerformanceTrends();
    res.json({
      success: true,
      data: trends,
      count: trends.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Export timing data
 * GET /api/performance/export
 */
router.get('/export', requireRoles(['admin', 'monitoring']), (req, res) => {
  try {
    const format = req.query.format || 'json';
    const data = exportTimingData(format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="performance-data.csv"');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="performance-data.json"');
    }

    res.send(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get performance dashboard summary
 * GET /api/performance/dashboard
 */
router.get('/dashboard', requireRoles(['admin', 'monitoring']), (req, res) => {
  try {
    const slowest = getSlowestEndpoints(5);
    const trends = getPerformanceTrends();
    const timingData = getTimingData();

    // Calculate summary statistics
    const totalRequests = timingData.length;
    const recentRequests = timingData.slice(-100);
    const avgResponseTime =
      recentRequests.length > 0
        ? Math.round(
            recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length
          )
        : 0;

    const slowRequestsCount = recentRequests.filter(req => req.responseTime > 2000).length;
    const slowRequestPercentage =
      recentRequests.length > 0 ? Math.round((slowRequestsCount / recentRequests.length) * 100) : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalRequests,
          avgResponseTime: `${avgResponseTime}ms`,
          slowRequestsCount,
          slowRequestPercentage: `${slowRequestPercentage}%`,
        },
        slowestEndpoints: slowest,
        trends: trends.filter(t => t.trend !== 'stable').slice(0, 5), // Show only changing trends
        recentSlowRequests: recentRequests.filter(req => req.responseTime > 2000).slice(-10),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Clear timing data (admin only)
 * DELETE /api/performance/clear
 */
router.delete('/clear', requireRoles(['admin']), (req, res) => {
  try {
    clearTimingData();
    res.json({
      success: true,
      message: 'Timing data cleared successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
