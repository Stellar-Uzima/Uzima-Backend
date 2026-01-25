import axios from 'axios';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// Initialize Redis client for caching
let redisClient = null;
try {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 100, 2000);
    },
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
    redisClient = null; // Disable caching if Redis fails
  });
} catch (error) {
  logger.warn('Redis not available, geolocation caching disabled:', error.message);
}

/**
 * Geolocation Service
 * Handles IP geolocation using ipapi.co API with Redis caching
 */
class GeolocationService {
  constructor() {
    this.apiUrl = process.env.IPAPI_CO_BASE_URL || 'https://ipapi.co';
    this.apiKey = process.env.IPAPI_CO_API_KEY || null;
    this.cacheTtl = parseInt(process.env.GEOLOCATION_CACHE_TTL_HOURS || '24') * 3600; // 24 hours in seconds
    this.requestTimeout = 5000; // 5 seconds
  }

  /**
   * Get location data from IP address
   * @param {string} ip - IP address to geolocate
   * @returns {Promise<Object>} Location data
   */
  async getLocationFromIp(ip) {
    try {
      // Validate IP address
      if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return this._getDefaultLocation('localhost');
      }

      // Remove IPv6 prefix if present
      const cleanIp = ip.replace(/^::ffff:/, '');

      // Check cache first
      const cached = await this.getCachedLocation(cleanIp);
      if (cached) {
        logger.debug(`Geolocation cache hit for IP: ${cleanIp}`);
        return cached;
      }

      // Fetch from API
      logger.debug(`Fetching geolocation for IP: ${cleanIp}`);
      const locationData = await this._fetchFromApi(cleanIp);

      // Cache the result
      await this.cacheLocation(cleanIp, locationData);

      return locationData;
    } catch (error) {
      logger.error('Error getting location from IP:', error);
      return this._getDefaultLocation('error');
    }
  }

  /**
   * Fetch location data from ipapi.co API
   * @param {string} ip - IP address
   * @returns {Promise<Object>} Location data
   * @private
   */
  async _fetchFromApi(ip) {
    try {
      const url = this.apiKey
        ? `${this.apiUrl}/${ip}/json/?key=${this.apiKey}`
        : `${this.apiUrl}/${ip}/json/`;

      const response = await axios.get(url, {
        timeout: this.requestTimeout,
        headers: {
          'User-Agent': 'Uzima-Backend/1.0',
        },
      });

      const data = response.data;

      // Check for API errors
      if (data.error) {
        logger.warn(`ipapi.co error for IP ${ip}:`, data.reason);
        return this._getDefaultLocation('api_error');
      }

      // Normalize and return location data
      return {
        ip,
        country: data.country_name || 'Unknown',
        countryCode: data.country_code || 'XX',
        city: data.city || 'Unknown',
        region: data.region || 'Unknown',
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        timezone: data.timezone || 'UTC',
        isp: data.org || 'Unknown',
        postal: data.postal || null,
      };
    } catch (error) {
      if (error.response && error.response.status === 429) {
        logger.warn('ipapi.co rate limit exceeded');
      } else {
        logger.error('Error fetching from ipapi.co:', error.message);
      }
      return this._getDefaultLocation('api_error');
    }
  }

  /**
   * Get cached location data for IP
   * @param {string} ip - IP address
   * @returns {Promise<Object|null>} Cached location data or null
   */
  async getCachedLocation(ip) {
    if (!redisClient) return null;

    try {
      const cacheKey = `geolocation:${ip}`;
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Error getting cached location:', error.message);
      return null;
    }
  }

  /**
   * Cache location data for IP
   * @param {string} ip - IP address
   * @param {Object} locationData - Location data to cache
   * @returns {Promise<boolean>} Success status
   */
  async cacheLocation(ip, locationData) {
    if (!redisClient) return false;

    try {
      const cacheKey = `geolocation:${ip}`;
      await redisClient.setex(cacheKey, this.cacheTtl, JSON.stringify(locationData));
      return true;
    } catch (error) {
      logger.warn('Error caching location:', error.message);
      return false;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    // Validate inputs
    if (!this._isValidCoordinate(lat1, lon1) || !this._isValidCoordinate(lat2, lon2)) {
      logger.warn('Invalid coordinates provided to calculateDistance');
      return 0;
    }

    const R = 6371; // Earth's radius in kilometers
    const dLat = this._toRadians(lat2 - lat1);
    const dLon = this._toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRadians(lat1)) *
        Math.cos(this._toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Check if location is different from previous location
   * @param {Object} currentLocation - Current location data
   * @param {Object} previousLocation - Previous location data
   * @returns {boolean} True if location has changed significantly
   */
  isNewLocation(currentLocation, previousLocation) {
    if (!previousLocation) return true;

    // Check if country changed
    if (currentLocation.countryCode !== previousLocation.countryCode) {
      return true;
    }

    // Check if city changed
    if (currentLocation.city !== previousLocation.city) {
      return true;
    }

    // Check distance (consider new if > 50km)
    const distance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      previousLocation.latitude,
      previousLocation.longitude
    );

    return distance > 50;
  }

  /**
   * Get default location object for fallback scenarios
   * @param {string} reason - Reason for using default
   * @returns {Object} Default location data
   * @private
   */
  _getDefaultLocation(reason = 'unknown') {
    return {
      ip: 'unknown',
      country: 'Unknown',
      countryCode: 'XX',
      city: 'Unknown',
      region: 'Unknown',
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
      isp: 'Unknown',
      postal: null,
      _fallback: true,
      _reason: reason,
    };
  }

  /**
   * Convert degrees to radians
   * @param {number} degrees - Degrees value
   * @returns {number} Radians value
   * @private
   */
  _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate coordinate values
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {boolean} True if valid
   * @private
   */
  _isValidCoordinate(lat, lon) {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180 &&
      !(lat === 0 && lon === 0) // Exclude null island
    );
  }

  /**
   * Get location summary string
   * @param {Object} location - Location data
   * @returns {string} Formatted location string
   */
  getLocationSummary(location) {
    if (!location) return 'Unknown Location';

    const { city, region, country } = location;
    const parts = [];

    if (city && city !== 'Unknown') parts.push(city);
    if (region && region !== 'Unknown' && region !== city) parts.push(region);
    if (country && country !== 'Unknown') parts.push(country);

    return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
  }

  /**
   * Batch geocode multiple IPs (useful for analytics)
   * @param {string[]} ips - Array of IP addresses
   * @returns {Promise<Object[]>} Array of location data
   */
  async batchGeocode(ips) {
    const uniqueIps = [...new Set(ips)];
    const results = await Promise.all(
      uniqueIps.map((ip) => this.getLocationFromIp(ip).catch(() => this._getDefaultLocation('error')))
    );

    return results;
  }

  /**
   * Clear cache for specific IP or all geolocation cache
   * @param {string|null} ip - IP address to clear, or null for all
   * @returns {Promise<boolean>} Success status
   */
  async clearCache(ip = null) {
    if (!redisClient) return false;

    try {
      if (ip) {
        const cacheKey = `geolocation:${ip}`;
        await redisClient.del(cacheKey);
      } else {
        // Clear all geolocation cache
        const keys = await redisClient.keys('geolocation:*');
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      }
      return true;
    } catch (error) {
      logger.error('Error clearing geolocation cache:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new GeolocationService();
