import UserDevice from '../models/UserDevice.js';
import LoginHistory from '../models/LoginHistory.js';
import ApiResponse from '../utils/apiResponse.js';
import fingerprintService from '../services/fingerprintService.js';
import fraudDetectionService from '../services/fraudDetectionService.js';
import { logger } from '../utils/logger.js';

/**
 * Security Controller
 * Handles device management and security activity endpoints
 */
const securityController = {
  /**
   * Get all devices for authenticated user
   * GET /api/security/devices
   */
  getDevices: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { limit = 10, offset = 0, activeOnly = 'true', sortBy = '-lastSeenAt' } = req.query;

      const query = { userId };

      // Filter by active status
      if (activeOnly === 'true') {
        query.isActive = true;
      }

      const [devices, total] = await Promise.all([
        UserDevice.find(query)
          .sort(sortBy)
          .skip(parseInt(offset))
          .limit(Math.min(parseInt(limit), 50)) // Max 50 devices
          .lean(),
        UserDevice.countDocuments(query),
      ]);

      // Format device data for response
      const formattedDevices = devices.map(device => ({
        id: device._id,
        deviceInfo: device.deviceInfo,
        lastSeenAt: device.lastSeenAt,
        firstSeenAt: device.firstSeenAt,
        lastSeenLocation: device.lastSeenLocation,
        isTrusted: device.isTrusted,
        isActive: device.isActive,
        loginCount: device.loginCount,
        displayName: device.deviceInfo
          ? `${device.deviceInfo.browser || 'Unknown'} on ${device.deviceInfo.os || 'Unknown'}`
          : 'Unknown Device',
      }));

      return ApiResponse.success(
        res,
        {
          devices: formattedDevices,
          pagination: {
            total,
            limit: Math.min(parseInt(limit), 50),
            offset: parseInt(offset),
          },
        },
        'Devices retrieved successfully'
      );
    } catch (error) {
      logger.error('Error getting devices:', error);
      return ApiResponse.error(res, 'Failed to retrieve devices', 500);
    }
  },

  /**
   * Get login activity history for authenticated user
   * GET /api/security/activity
   */
  getActivity: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const {
        limit = 50,
        offset = 0,
        startDate,
        endDate,
        flaggedOnly = 'false',
        sortBy = '-loginAt',
      } = req.query;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy,
        flaggedOnly: flaggedOnly === 'true',
      };

      if (startDate) {
        options.startDate = new Date(startDate);
      }
      if (endDate) {
        options.endDate = new Date(endDate);
      }

      const result = await LoginHistory.getUserLoginHistory(userId, options);

      // Format activity data for response
      const formattedActivity = result.activity.map(log => {
        const activity = {
          id: log._id,
          loginAt: log.loginAt,
          ipAddress: log.ipAddress,
          location: log.location,
          userAgent: log.userAgent,
          loginStatus: log.loginStatus,
          isNewDevice: log.isNewDevice,
          isNewLocation: log.isNewLocation,
          fraudFlags: log.fraudFlags,
        };

        // Add device info if populated
        if (log.deviceId) {
          activity.device = {
            id: log.deviceId._id,
            browser: log.deviceId.deviceInfo?.browser,
            os: log.deviceId.deviceInfo?.os,
            isTrusted: log.deviceId.isTrusted,
          };
        }

        // Add fraud details if present
        if (log.fraudDetails && log.fraudFlags?.impossibleTravel) {
          activity.fraudDetails = log.fraudDetails;
        }

        return activity;
      });

      return ApiResponse.success(
        res,
        {
          activity: formattedActivity,
          pagination: result.pagination,
        },
        'Activity retrieved successfully'
      );
    } catch (error) {
      logger.error('Error getting activity:', error);
      return ApiResponse.error(res, 'Failed to retrieve activity', 500);
    }
  },

  /**
   * Mark a device as trusted
   * PUT /api/security/devices/:deviceId/trust
   */
  trustDevice: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { deviceId } = req.params;
      const { trusted = true } = req.body;

      if (trusted) {
        await fingerprintService.trustDevice(userId, deviceId);
      } else {
        await fingerprintService.untrustDevice(userId, deviceId);
      }

      return ApiResponse.success(
        res,
        {
          deviceId,
          trusted,
        },
        `Device ${trusted ? 'trusted' : 'untrusted'} successfully`
      );
    } catch (error) {
      logger.error('Error trusting device:', error);

      if (error.message === 'Device not found or unauthorized') {
        return ApiResponse.error(res, 'Device not found or unauthorized', 404);
      }

      return ApiResponse.error(res, 'Failed to update device trust status', 500);
    }
  },

  /**
   * Remove a device (mark as inactive)
   * DELETE /api/security/devices/:deviceId
   */
  removeDevice: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { deviceId } = req.params;

      await fingerprintService.removeDevice(userId, deviceId);

      return ApiResponse.success(
        res,
        {
          deviceId,
          removed: true,
        },
        'Device removed successfully'
      );
    } catch (error) {
      logger.error('Error removing device:', error);

      if (error.message === 'Device not found or unauthorized') {
        return ApiResponse.error(res, 'Device not found or unauthorized', 404);
      }

      return ApiResponse.error(res, 'Failed to remove device', 500);
    }
  },

  /**
   * Get security summary for authenticated user
   * GET /api/security/summary
   */
  getSummary: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { days = 30 } = req.query;

      // Get security metrics
      const [activeDevices, recentLogins, suspiciousLoginCount, loginPatterns] = await Promise.all([
        UserDevice.countDocuments({ userId, isActive: true }),
        LoginHistory.countDocuments({
          userId,
          loginAt: { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) },
          loginStatus: 'success',
        }),
        LoginHistory.getSuspiciousLoginCount(userId, parseInt(days)),
        fraudDetectionService.analyzeLoginPatterns(userId, parseInt(days)),
      ]);

      return ApiResponse.success(
        res,
        {
          period: `Last ${days} days`,
          activeDevices,
          recentLogins,
          suspiciousLoginCount,
          patterns: loginPatterns.patterns,
          metrics: {
            uniqueLocations: loginPatterns.uniqueLocations,
            uniqueCountries: loginPatterns.uniqueCountries,
            uniqueDevices: loginPatterns.uniqueDevices,
          },
        },
        'Security summary retrieved successfully'
      );
    } catch (error) {
      logger.error('Error getting security summary:', error);
      return ApiResponse.error(res, 'Failed to retrieve security summary', 500);
    }
  },

  /**
   * Get fraud report for authenticated user
   * GET /api/security/fraud-report
   */
  getFraudReport: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { days = 30 } = req.query;

      const report = await fraudDetectionService.generateFraudReport(userId, parseInt(days));

      return ApiResponse.success(res, report, 'Fraud report generated successfully');
    } catch (error) {
      logger.error('Error generating fraud report:', error);
      return ApiResponse.error(res, 'Failed to generate fraud report', 500);
    }
  },

  /**
   * Get specific device details
   * GET /api/security/devices/:deviceId
   */
  getDeviceDetails: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { deviceId } = req.params;

      const device = await UserDevice.findOne({ _id: deviceId, userId }).lean();

      if (!device) {
        return ApiResponse.error(res, 'Device not found', 404);
      }

      // Get recent logins for this device
      const recentLogins = await LoginHistory.find({
        userId,
        deviceId,
        loginStatus: 'success',
      })
        .sort({ loginAt: -1 })
        .limit(10)
        .select('loginAt location ipAddress fraudFlags')
        .lean();

      return ApiResponse.success(
        res,
        {
          device: {
            id: device._id,
            deviceInfo: device.deviceInfo,
            lastSeenAt: device.lastSeenAt,
            firstSeenAt: device.firstSeenAt,
            lastSeenLocation: device.lastSeenLocation,
            isTrusted: device.isTrusted,
            isActive: device.isActive,
            loginCount: device.loginCount,
          },
          recentLogins,
        },
        'Device details retrieved successfully'
      );
    } catch (error) {
      logger.error('Error getting device details:', error);
      return ApiResponse.error(res, 'Failed to retrieve device details', 500);
    }
  },
};

export default securityController;
