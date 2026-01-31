import LoginHistory from '../models/LoginHistory.js';
import geolocationService from './geolocationService.js';
import { logger } from '../utils/logger.js';

/**
 * Fraud Detection Service
 * Handles detection of impossible travel and other suspicious login patterns
 */
class FraudDetectionService {
  constructor() {
    // Speed threshold in km/h (commercial airplanes cruise at ~900 km/h)
    this.impossibleTravelThreshold = parseInt(
      process.env.IMPOSSIBLE_TRAVEL_THRESHOLD_KMH || '1000'
    );

    // Time window for suspicious activity detection (in minutes)
    this.suspiciousLoginWindow = parseInt(process.env.SUSPICIOUS_LOGIN_WINDOW_MINUTES || '15');
  }

  /**
   * Check for impossible travel based on user's login history
   * @param {string} userId - User ID
   * @param {Object} currentLocation - Current login location
   * @param {string} sessionId - Current session ID (to exclude from comparison)
   * @returns {Promise<Object>} Fraud detection result
   */
  async checkImpossibleTravel(userId, currentLocation, sessionId = null) {
    try {
      // Get last successful login
      const lastLogin = await LoginHistory.getLastSuccessfulLogin(userId, sessionId);

      // If no previous login, no fraud to detect
      if (!lastLogin || !lastLogin.location) {
        return {
          impossibleTravel: false,
          isNewLocation: true,
          flags: {
            impossibleTravel: false,
            suspiciousIp: false,
            unusualActivity: false,
          },
          details: null,
        };
      }

      const previousLocation = lastLogin.location;
      const previousTime = new Date(lastLogin.loginAt);
      const currentTime = new Date();

      // Calculate distance between locations
      const distanceKm = geolocationService.calculateDistance(
        previousLocation.latitude,
        previousLocation.longitude,
        currentLocation.latitude,
        currentLocation.longitude
      );

      // Calculate time difference in minutes
      const timeDiffMs = currentTime - previousTime;
      const timeDiffMinutes = timeDiffMs / (1000 * 60);
      const timeDiffHours = timeDiffMinutes / 60;

      // Calculate required travel speed
      let calculatedSpeedKmh = 0;
      if (timeDiffHours > 0) {
        calculatedSpeedKmh = distanceKm / timeDiffHours;
      }

      // Check if travel is impossible
      const impossibleTravel = calculatedSpeedKmh > this.impossibleTravelThreshold;

      // Check if location is new
      const isNewLocation = geolocationService.isNewLocation(currentLocation, previousLocation);

      // Prepare fraud details
      const fraudDetails = {
        previousLocation: {
          city: previousLocation.city,
          country: previousLocation.country,
          latitude: previousLocation.latitude,
          longitude: previousLocation.longitude,
        },
        distanceKm: Math.round(distanceKm),
        timeDiffMinutes: Math.round(timeDiffMinutes),
        calculatedSpeedKmh: Math.round(calculatedSpeedKmh),
      };

      // Log if impossible travel detected
      if (impossibleTravel) {
        logger.warn(`Impossible travel detected for user ${userId}:`, {
          from: `${previousLocation.city}, ${previousLocation.country}`,
          to: `${currentLocation.city}, ${currentLocation.country}`,
          distance: `${fraudDetails.distanceKm} km`,
          time: `${fraudDetails.timeDiffMinutes} minutes`,
          speed: `${fraudDetails.calculatedSpeedKmh} km/h`,
        });
      }

      return {
        impossibleTravel,
        isNewLocation,
        flags: {
          impossibleTravel,
          suspiciousIp: false, // To be implemented with IP blacklist
          unusualActivity: false, // To be implemented with behavior analysis
        },
        details: impossibleTravel ? fraudDetails : null,
      };
    } catch (error) {
      logger.error('Error checking impossible travel:', error);

      // Return safe defaults on error
      return {
        impossibleTravel: false,
        isNewLocation: false,
        flags: {
          impossibleTravel: false,
          suspiciousIp: false,
          unusualActivity: false,
        },
        details: null,
      };
    }
  }

  /**
   * Calculate travel speed between two locations
   * @param {Object} location1 - First location with latitude/longitude
   * @param {Object} location2 - Second location with latitude/longitude
   * @param {number} timeDiffMinutes - Time difference in minutes
   * @returns {number} Speed in km/h
   */
  calculateTravelSpeed(location1, location2, timeDiffMinutes) {
    const distance = geolocationService.calculateDistance(
      location1.latitude,
      location1.longitude,
      location2.latitude,
      location2.longitude
    );

    const timeDiffHours = timeDiffMinutes / 60;

    if (timeDiffHours <= 0) {
      return 0;
    }

    return distance / timeDiffHours;
  }

  /**
   * Check if travel speed is impossible
   * @param {number} speedKmh - Speed in km/h
   * @returns {boolean} True if speed is impossible
   */
  isImpossibleSpeed(speedKmh) {
    return speedKmh > this.impossibleTravelThreshold;
  }

  /**
   * Calculate fraud risk score for a login attempt
   * @param {Object} loginData - Login attempt data
   * @returns {Promise<Object>} Risk assessment
   */
  async getFraudScore(loginData) {
    try {
      const { userId, location, isNewDevice, impossibleTravel, deviceTrusted = false } = loginData;

      let riskScore = 0;
      const riskFactors = [];

      // Impossible travel is highest risk
      if (impossibleTravel) {
        riskScore += 50;
        riskFactors.push('Impossible travel detected');
      }

      // New device from new location
      if (isNewDevice && location.country) {
        const recentLogins = await this._getRecentLoginCount(userId, 7);
        if (recentLogins === 0) {
          riskScore += 30;
          riskFactors.push('First login in 7 days from new device');
        } else {
          riskScore += 15;
          riskFactors.push('New device');
        }
      }

      // Login from different country
      const lastLogin = await LoginHistory.getLastSuccessfulLogin(userId);
      if (lastLogin && lastLogin.location) {
        const countryChanged = lastLogin.location.countryCode !== location.countryCode;
        if (countryChanged) {
          riskScore += 10;
          riskFactors.push('Country change');
        }
      }

      // Check for multiple failed login attempts
      const failedAttempts = await this._getRecentFailedLogins(userId, 30);
      if (failedAttempts > 3) {
        riskScore += 20;
        riskFactors.push(`${failedAttempts} failed login attempts in last 30 minutes`);
      }

      // Reduce risk for trusted devices
      if (deviceTrusted) {
        riskScore = Math.max(0, riskScore - 20);
        riskFactors.push('Trusted device (risk reduced)');
      }

      // Determine risk level
      let riskLevel = 'low';
      if (riskScore >= 70) {
        riskLevel = 'critical';
      } else if (riskScore >= 50) {
        riskLevel = 'high';
      } else if (riskScore >= 30) {
        riskLevel = 'medium';
      }

      return {
        riskScore: Math.min(100, riskScore), // Cap at 100
        riskLevel,
        riskFactors,
        recommendation: this._getRecommendation(riskScore),
      };
    } catch (error) {
      logger.error('Error calculating fraud score:', error);
      return {
        riskScore: 0,
        riskLevel: 'low',
        riskFactors: [],
        recommendation: 'allow',
      };
    }
  }

  /**
   * Analyze login patterns for suspicious activity
   * @param {string} userId - User ID
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Pattern analysis
   */
  async analyzeLoginPatterns(userId, days = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const logins = await LoginHistory.find({
        userId,
        loginAt: { $gte: startDate },
        loginStatus: 'success',
      })
        .sort({ loginAt: -1 })
        .lean();

      if (logins.length === 0) {
        return {
          totalLogins: 0,
          uniqueLocations: 0,
          uniqueDevices: 0,
          suspiciousCount: 0,
          patterns: [],
        };
      }

      // Analyze unique locations
      const uniqueLocations = new Set();
      const uniqueCountries = new Set();
      const uniqueDevices = new Set();
      let suspiciousCount = 0;

      logins.forEach(login => {
        if (login.location) {
          uniqueLocations.add(`${login.location.city}, ${login.location.country}`);
          uniqueCountries.add(login.location.countryCode);
        }
        if (login.deviceId) {
          uniqueDevices.add(login.deviceId.toString());
        }
        if (login.fraudFlags?.impossibleTravel) {
          suspiciousCount++;
        }
      });

      const patterns = [];

      // Check for frequent country changes
      if (uniqueCountries.size > 5) {
        patterns.push({
          type: 'frequent_country_changes',
          description: `Logins from ${uniqueCountries.size} different countries in ${days} days`,
          severity: 'medium',
        });
      }

      // Check for high number of devices
      if (uniqueDevices.size > 10) {
        patterns.push({
          type: 'many_devices',
          description: `${uniqueDevices.size} different devices used in ${days} days`,
          severity: 'medium',
        });
      }

      // Check for rapid succession logins
      const rapidLogins = this._detectRapidLogins(logins);
      if (rapidLogins.count > 0) {
        patterns.push({
          type: 'rapid_logins',
          description: `${rapidLogins.count} logins within ${rapidLogins.windowMinutes} minutes`,
          severity: 'low',
        });
      }

      return {
        totalLogins: logins.length,
        uniqueLocations: uniqueLocations.size,
        uniqueCountries: uniqueCountries.size,
        uniqueDevices: uniqueDevices.size,
        suspiciousCount,
        patterns,
      };
    } catch (error) {
      logger.error('Error analyzing login patterns:', error);
      return {
        totalLogins: 0,
        uniqueLocations: 0,
        uniqueDevices: 0,
        suspiciousCount: 0,
        patterns: [],
      };
    }
  }

  /**
   * Get recent login count for a user
   * @param {string} userId - User ID
   * @param {number} days - Number of days to check
   * @returns {Promise<number>} Login count
   * @private
   */
  async _getRecentLoginCount(userId, days) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return await LoginHistory.countDocuments({
      userId,
      loginAt: { $gte: startDate },
      loginStatus: 'success',
    });
  }

  /**
   * Get recent failed login attempts
   * @param {string} userId - User ID
   * @param {number} minutes - Time window in minutes
   * @returns {Promise<number>} Failed login count
   * @private
   */
  async _getRecentFailedLogins(userId, minutes) {
    const startTime = new Date(Date.now() - minutes * 60 * 1000);

    return await LoginHistory.countDocuments({
      userId,
      loginAt: { $gte: startTime },
      loginStatus: 'failed',
    });
  }

  /**
   * Detect rapid succession logins
   * @param {Array} logins - Array of login records
   * @returns {Object} Rapid login detection result
   * @private
   */
  _detectRapidLogins(logins) {
    let rapidCount = 0;
    const windowMinutes = 5;

    for (let i = 0; i < logins.length - 1; i++) {
      const timeDiff = new Date(logins[i].loginAt) - new Date(logins[i + 1].loginAt);
      const diffMinutes = timeDiff / (1000 * 60);

      if (diffMinutes < windowMinutes) {
        rapidCount++;
      }
    }

    return {
      count: rapidCount,
      windowMinutes,
    };
  }

  /**
   * Get recommendation based on risk score
   * @param {number} riskScore - Risk score (0-100)
   * @returns {string} Recommendation
   * @private
   */
  _getRecommendation(riskScore) {
    if (riskScore >= 70) {
      return 'block'; // Block login
    } else if (riskScore >= 50) {
      return 'challenge'; // Require additional verification
    } else if (riskScore >= 30) {
      return 'monitor'; // Allow but monitor closely
    }
    return 'allow'; // Allow normally
  }

  /**
   * Check if IP is suspicious (placeholder for IP blacklist integration)
   * @param {string} ip - IP address
   * @returns {Promise<boolean>} True if suspicious
   */
  async isSuspiciousIp(ip) {
    // TODO: Integrate with IP blacklist service
    // For now, return false
    return false;
  }

  /**
   * Generate fraud report for a user
   * @param {string} userId - User ID
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Fraud report
   */
  async generateFraudReport(userId, days = 30) {
    try {
      const [suspiciousLogins, loginPatterns, flaggedCount] = await Promise.all([
        LoginHistory.find({
          userId,
          loginAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
          $or: [
            { 'fraudFlags.impossibleTravel': true },
            { 'fraudFlags.suspiciousIp': true },
            { 'fraudFlags.unusualActivity': true },
          ],
        })
          .sort({ loginAt: -1 })
          .limit(50)
          .lean(),
        this.analyzeLoginPatterns(userId, days),
        LoginHistory.getSuspiciousLoginCount(userId, days),
      ]);

      return {
        userId,
        period: `Last ${days} days`,
        summary: {
          totalSuspiciousLogins: flaggedCount,
          impossibleTravelCount: suspiciousLogins.filter(l => l.fraudFlags?.impossibleTravel)
            .length,
          uniqueLocations: loginPatterns.uniqueLocations,
          uniqueDevices: loginPatterns.uniqueDevices,
        },
        patterns: loginPatterns.patterns,
        recentSuspiciousLogins: suspiciousLogins,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error generating fraud report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new FraudDetectionService();
