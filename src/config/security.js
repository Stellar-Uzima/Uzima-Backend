/**
 * Security Configuration
 * Configuration for IP geolocation, fraud detection, and login security
 */

export default {
  // IP Geolocation settings
  geolocation: {
    provider: 'ipapi',
    apiUrl: process.env.IPAPI_CO_BASE_URL || 'https://ipapi.co',
    apiKey: process.env.IPAPI_CO_API_KEY || null, // Optional for free tier (30k requests/month)
    cacheTtl: parseInt(process.env.GEOLOCATION_CACHE_TTL_HOURS || '24') * 3600, // 24 hours in seconds
    requestTimeout: 5000, // 5 seconds
  },

  // Fraud Detection settings
  fraudDetection: {
    // Speed threshold in km/h (airplane cruising speed ~900 km/h)
    impossibleTravelThreshold: parseInt(process.env.IMPOSSIBLE_TRAVEL_THRESHOLD_KMH || '1000'),

    // Time window for suspicious activity detection (in minutes)
    suspiciousLoginWindow: parseInt(process.env.SUSPICIOUS_LOGIN_WINDOW_MINUTES || '15'),

    // Maximum allowed devices per user
    maxDevicesPerUser: parseInt(process.env.MAX_DEVICES_PER_USER || '20'),

    // Distance threshold to consider as new location (in km)
    newLocationThreshold: parseInt(process.env.NEW_LOCATION_THRESHOLD_KM || '50'),
  },

  // Login History settings
  loginHistory: {
    // Number of days to retain login history
    retentionDays: parseInt(process.env.LOGIN_HISTORY_RETENTION_DAYS || '180'),

    // Maximum number of login history entries per user
    maxEntriesPerUser: parseInt(process.env.MAX_LOGIN_HISTORY_ENTRIES || '500'),

    // Automatically expire old entries
    enableTTL: process.env.LOGIN_HISTORY_ENABLE_TTL !== 'false',
  },

  // Browser Fingerprinting settings
  fingerprinting: {
    // Minimum confidence score to accept fingerprint (0-1)
    minConfidenceScore: parseFloat(process.env.FINGERPRINT_MIN_CONFIDENCE || '0.5'),

    // Enable fingerprint spoofing detection
    enableSpoofingDetection: process.env.FINGERPRINT_ENABLE_SPOOFING_DETECTION !== 'false',
  },

  // Security Notifications settings
  notifications: {
    // Send notification on new device login
    notifyOnNewDevice: process.env.NOTIFY_ON_NEW_DEVICE !== 'false',

    // Send notification on new location login
    notifyOnNewLocation: process.env.NOTIFY_ON_NEW_LOCATION === 'true', // Off by default

    // Send notification on impossible travel detection
    notifyOnImpossibleTravel: process.env.NOTIFY_ON_IMPOSSIBLE_TRAVEL !== 'false',

    // Priority level for security notifications ('low', 'medium', 'high')
    defaultPriority: process.env.SECURITY_NOTIFICATION_PRIORITY || 'medium',
  },

  // Risk Scoring thresholds
  riskScoring: {
    // Risk level thresholds (0-100)
    lowThreshold: parseInt(process.env.RISK_LOW_THRESHOLD || '30'),
    mediumThreshold: parseInt(process.env.RISK_MEDIUM_THRESHOLD || '50'),
    highThreshold: parseInt(process.env.RISK_HIGH_THRESHOLD || '70'),
    criticalThreshold: parseInt(process.env.RISK_CRITICAL_THRESHOLD || '90'),

    // Actions based on risk scores
    actions: {
      low: 'allow', // Allow login normally
      medium: 'monitor', // Allow but monitor closely
      high: 'challenge', // Require additional verification
      critical: 'block', // Block login attempt
    },
  },

  // Device Trust settings
  deviceTrust: {
    // Automatically trust devices after N successful logins
    autoTrustAfterLogins: parseInt(process.env.AUTO_TRUST_AFTER_LOGINS || '5'),

    // Days to keep device as trusted before re-verification
    trustExpiryDays: parseInt(process.env.DEVICE_TRUST_EXPIRY_DAYS || '90'),
  },

  // Redis Cache settings (for geolocation caching)
  cache: {
    enabled: process.env.REDIS_HOST ? true : false,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    ttl: parseInt(process.env.GEOLOCATION_CACHE_TTL_HOURS || '24') * 3600,
  },

  // Feature Flags
  features: {
    // Enable/disable geolocation tracking
    enableGeolocation: process.env.ENABLE_GEOLOCATION !== 'false',

    // Enable/disable fingerprinting
    enableFingerprinting: process.env.ENABLE_FINGERPRINTING !== 'false',

    // Enable/disable fraud detection
    enableFraudDetection: process.env.ENABLE_FRAUD_DETECTION !== 'false',

    // Enable/disable security notifications
    enableSecurityNotifications: process.env.ENABLE_SECURITY_NOTIFICATIONS !== 'false',
  },
};
