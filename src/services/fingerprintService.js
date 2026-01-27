import crypto from 'crypto';
import UserDevice from '../models/UserDevice.js';
import { logger } from '../utils/logger.js';

/**
 * Fingerprint Service
 * Handles browser fingerprinting using FingerprintJS data
 */
class FingerprintService {
  /**
   * Hash a fingerprint for storage and lookups
   * @param {string} fingerprint - Raw fingerprint (visitorId)
   * @returns {string} SHA-256 hash of fingerprint
   */
  hashFingerprint(fingerprint) {
    if (!fingerprint) {
      throw new Error('Fingerprint is required');
    }
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }

  /**
   * Parse device information from FingerprintJS data
   * @param {Object} fpData - FingerprintJS result data
   * @param {string} userAgent - User agent string
   * @returns {Object} Parsed device information
   */
  parseDeviceInfo(fpData, userAgent = '') {
    const deviceInfo = {
      userAgent: userAgent || 'Unknown',
      browser: 'Unknown',
      os: 'Unknown',
      device: 'Unknown',
      screenResolution: 'Unknown',
      timezone: 'Unknown',
      language: 'Unknown',
    };

    try {
      // Parse from FingerprintJS components if available
      if (fpData.components) {
        const components = fpData.components;

        // Screen resolution
        if (components.screenResolution) {
          const { value } = components.screenResolution;
          if (Array.isArray(value) && value.length >= 2) {
            deviceInfo.screenResolution = `${value[0]}x${value[1]}`;
          }
        }

        // Timezone
        if (components.timezone) {
          deviceInfo.timezone = components.timezone.value || 'Unknown';
        }

        // Languages
        if (components.languages) {
          const langs = components.languages.value;
          if (Array.isArray(langs) && langs.length > 0) {
            deviceInfo.language = langs[0];
          }
        }

        // Platform (OS)
        if (components.platform) {
          deviceInfo.os = components.platform.value || 'Unknown';
        }

        // Vendor (helps identify device)
        if (components.vendor) {
          deviceInfo.device = components.vendor.value || 'Unknown';
        }
      }

      // Parse user agent for browser info
      if (userAgent) {
        deviceInfo.browser = this._parseBrowser(userAgent);
        if (deviceInfo.os === 'Unknown') {
          deviceInfo.os = this._parseOS(userAgent);
        }
        if (deviceInfo.device === 'Unknown') {
          deviceInfo.device = this._parseDeviceType(userAgent);
        }
      }
    } catch (error) {
      logger.error('Error parsing device info:', error);
    }

    return deviceInfo;
  }

  /**
   * Find or create a device record for a user
   * @param {string} userId - User ID
   * @param {Object} fpData - FingerprintJS data
   * @param {Object} location - Geolocation data
   * @param {string} userAgent - User agent string
   * @returns {Promise<Object>} Device record with isNew flag
   */
  async findOrCreateDevice(userId, fpData, location, userAgent = '') {
    try {
      if (!fpData || !fpData.visitorId) {
        throw new Error('Invalid fingerprint data');
      }

      const fingerprint = fpData.visitorId;
      const fingerprintHash = this.hashFingerprint(fingerprint);

      // Try to find existing device
      let device = await UserDevice.findByFingerprint(userId, fingerprintHash);

      if (device) {
        // Existing device - update last seen
        await device.updateLastSeen(location);
        return {
          device,
          isNew: false,
          isNewLocation: this._isLocationChanged(device.lastSeenLocation, location),
        };
      }

      // New device - create record
      const deviceInfo = this.parseDeviceInfo(fpData, userAgent);

      device = new UserDevice({
        userId,
        fingerprint,
        fingerprintHash,
        deviceInfo,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        lastSeenLocation: location,
        isTrusted: false,
        isActive: true,
        loginCount: 1,
      });

      await device.save();

      logger.info(`New device registered for user ${userId}: ${device._id}`);

      return {
        device,
        isNew: true,
        isNewLocation: true,
      };
    } catch (error) {
      logger.error('Error in findOrCreateDevice:', error);
      throw error;
    }
  }

  /**
   * Update device last seen information
   * @param {string} deviceId - Device ID
   * @param {Object} location - Geolocation data
   * @returns {Promise<Object>} Updated device
   */
  async updateDeviceLastSeen(deviceId, location) {
    try {
      const device = await UserDevice.findById(deviceId);
      if (!device) {
        throw new Error('Device not found');
      }

      return await device.updateLastSeen(location);
    } catch (error) {
      logger.error('Error updating device last seen:', error);
      throw error;
    }
  }

  /**
   * Mark a device as trusted
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} Updated device
   */
  async trustDevice(userId, deviceId) {
    try {
      const device = await UserDevice.findOne({ _id: deviceId, userId });
      if (!device) {
        throw new Error('Device not found or unauthorized');
      }

      device.isTrusted = true;
      await device.save();

      logger.info(`Device ${deviceId} marked as trusted by user ${userId}`);
      return device;
    } catch (error) {
      logger.error('Error trusting device:', error);
      throw error;
    }
  }

  /**
   * Mark a device as untrusted
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<Object>} Updated device
   */
  async untrustDevice(userId, deviceId) {
    try {
      const device = await UserDevice.findOne({ _id: deviceId, userId });
      if (!device) {
        throw new Error('Device not found or unauthorized');
      }

      device.isTrusted = false;
      await device.save();

      logger.info(`Device ${deviceId} marked as untrusted by user ${userId}`);
      return device;
    } catch (error) {
      logger.error('Error untrusting device:', error);
      throw error;
    }
  }

  /**
   * Remove a device (mark as inactive)
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<boolean>} Success status
   */
  async removeDevice(userId, deviceId) {
    try {
      const device = await UserDevice.findOne({ _id: deviceId, userId });
      if (!device) {
        throw new Error('Device not found or unauthorized');
      }

      await device.deactivate();

      logger.info(`Device ${deviceId} removed by user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error removing device:', error);
      throw error;
    }
  }

  /**
   * Get all devices for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of devices
   */
  async getUserDevices(userId, options = {}) {
    try {
      return await UserDevice.getActiveDevices(userId, options);
    } catch (error) {
      logger.error('Error getting user devices:', error);
      throw error;
    }
  }

  /**
   * Validate fingerprint data structure
   * @param {Object} fpData - FingerprintJS data
   * @returns {boolean} True if valid
   */
  validateFingerprintData(fpData) {
    if (!fpData || typeof fpData !== 'object') {
      return false;
    }

    // Must have visitorId
    if (!fpData.visitorId || typeof fpData.visitorId !== 'string') {
      return false;
    }

    // Optional: Check confidence score if present
    if (fpData.confidence && typeof fpData.confidence.score === 'number') {
      // Log low confidence scores
      if (fpData.confidence.score < 0.7) {
        logger.warn(`Low confidence fingerprint: ${fpData.confidence.score}`);
      }
    }

    return true;
  }

  /**
   * Detect potential fingerprint spoofing
   * @param {Object} fpData - FingerprintJS data
   * @returns {Object} Spoofing detection result
   */
  detectSpoofing(fpData) {
    const result = {
      isSuspicious: false,
      reasons: [],
    };

    try {
      // Check confidence score
      if (fpData.confidence && fpData.confidence.score < 0.5) {
        result.isSuspicious = true;
        result.reasons.push('Low confidence score');
      }

      // Check for common spoofing patterns
      if (fpData.components) {
        const components = fpData.components;

        // Check for headless browser indicators
        if (components.vendor && components.vendor.value === '') {
          result.isSuspicious = true;
          result.reasons.push('Empty vendor (possible headless browser)');
        }

        // Check for inconsistent platform/user agent
        if (components.platform && components.userAgent) {
          const platform = components.platform.value || '';
          const userAgent = components.userAgent.value || '';
          if (platform && userAgent && !userAgent.toLowerCase().includes(platform.toLowerCase())) {
            result.isSuspicious = true;
            result.reasons.push('Platform/User Agent mismatch');
          }
        }
      }
    } catch (error) {
      logger.error('Error detecting spoofing:', error);
    }

    return result;
  }

  /**
   * Parse browser from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Browser name and version
   * @private
   */
  _parseBrowser(userAgent) {
    const ua = userAgent.toLowerCase();

    if (ua.includes('edg/')) {
      const match = userAgent.match(/Edg\/([\d.]+)/);
      return match ? `Edge ${match[1]}` : 'Edge';
    }
    if (ua.includes('chrome/') && !ua.includes('edg/')) {
      const match = userAgent.match(/Chrome\/([\d.]+)/);
      return match ? `Chrome ${match[1]}` : 'Chrome';
    }
    if (ua.includes('firefox/')) {
      const match = userAgent.match(/Firefox\/([\d.]+)/);
      return match ? `Firefox ${match[1]}` : 'Firefox';
    }
    if (ua.includes('safari/') && !ua.includes('chrome')) {
      const match = userAgent.match(/Version\/([\d.]+)/);
      return match ? `Safari ${match[1]}` : 'Safari';
    }
    if (ua.includes('opera/') || ua.includes('opr/')) {
      const match = userAgent.match(/(?:Opera|OPR)\/([\d.]+)/);
      return match ? `Opera ${match[1]}` : 'Opera';
    }

    return 'Unknown Browser';
  }

  /**
   * Parse OS from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} OS name
   * @private
   */
  _parseOS(userAgent) {
    const ua = userAgent.toLowerCase();

    if (ua.includes('windows nt 10.0')) return 'Windows 10';
    if (ua.includes('windows nt 11.0')) return 'Windows 11';
    if (ua.includes('windows nt 6.3')) return 'Windows 8.1';
    if (ua.includes('windows nt 6.2')) return 'Windows 8';
    if (ua.includes('windows nt 6.1')) return 'Windows 7';
    if (ua.includes('windows')) return 'Windows';

    if (ua.includes('mac os x')) {
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      if (match) {
        const version = match[1].replace(/_/g, '.');
        return `macOS ${version}`;
      }
      return 'macOS';
    }

    if (ua.includes('android')) {
      const match = userAgent.match(/Android ([\d.]+)/);
      return match ? `Android ${match[1]}` : 'Android';
    }

    if (ua.includes('iphone') || ua.includes('ipad')) {
      const match = userAgent.match(/OS ([\d_]+)/);
      if (match) {
        const version = match[1].replace(/_/g, '.');
        return `iOS ${version}`;
      }
      return 'iOS';
    }

    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('ubuntu')) return 'Ubuntu';
    if (ua.includes('debian')) return 'Debian';
    if (ua.includes('fedora')) return 'Fedora';

    return 'Unknown OS';
  }

  /**
   * Parse device type from user agent
   * @param {string} userAgent - User agent string
   * @returns {string} Device type
   * @private
   */
  _parseDeviceType(userAgent) {
    const ua = userAgent.toLowerCase();

    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'Mobile';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'Tablet';
    }
    if (ua.includes('smart-tv') || ua.includes('smarttv')) {
      return 'Smart TV';
    }

    return 'Desktop';
  }

  /**
   * Check if location has changed significantly
   * @param {Object} oldLocation - Previous location
   * @param {Object} newLocation - Current location
   * @returns {boolean} True if location changed
   * @private
   */
  _isLocationChanged(oldLocation, newLocation) {
    if (!oldLocation || !newLocation) return true;

    // Check country change
    if (oldLocation.country !== newLocation.country) {
      return true;
    }

    // Check city change
    if (oldLocation.city !== newLocation.city) {
      return true;
    }

    return false;
  }
}

// Export singleton instance
export default new FingerprintService();
