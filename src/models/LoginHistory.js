import mongoose from 'mongoose';

const loginHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserDevice',
      required: false,
    },
    fingerprint: {
      type: String,
      required: false,
    },
    ipAddress: {
      type: String,
      required: true,
      index: true,
    },
    location: {
      country: String,
      countryCode: String,
      city: String,
      region: String,
      latitude: Number,
      longitude: Number,
      timezone: String,
      isp: String,
    },
    userAgent: {
      type: String,
      required: false,
    },
    loginAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    loginStatus: {
      type: String,
      enum: ['success', 'failed', 'blocked'],
      default: 'success',
      required: true,
    },
    isNewDevice: {
      type: Boolean,
      default: false,
    },
    isNewLocation: {
      type: Boolean,
      default: false,
    },
    fraudFlags: {
      impossibleTravel: {
        type: Boolean,
        default: false,
      },
      suspiciousIp: {
        type: Boolean,
        default: false,
      },
      unusualActivity: {
        type: Boolean,
        default: false,
      },
    },
    fraudDetails: {
      previousLocation: {
        type: mongoose.Schema.Types.Mixed,
        required: false,
      },
      distanceKm: {
        type: Number,
        required: false,
      },
      timeDiffMinutes: {
        type: Number,
        required: false,
      },
      calculatedSpeedKmh: {
        type: Number,
        required: false,
      },
    },
    notificationSent: {
      type: Boolean,
      default: false,
    },
    sessionId: {
      type: String,
      required: false,
      index: true,
    },
    // TTL for automatic cleanup (180 days)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient querying
loginHistorySchema.index({ userId: 1, loginAt: -1 });
loginHistorySchema.index({ userId: 1, isNewDevice: 1 });
loginHistorySchema.index({ userId: 1, 'fraudFlags.impossibleTravel': 1 });
loginHistorySchema.index({ loginStatus: 1, loginAt: -1 });

// TTL index for automatic cleanup
loginHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for location display
loginHistorySchema.virtual('locationDisplay').get(function () {
  const { city, country } = this.location || {};
  if (city && country) {
    return `${city}, ${country}`;
  }
  if (country) {
    return country;
  }
  return 'Unknown Location';
});

// Virtual for checking if login is flagged
loginHistorySchema.virtual('isFlagged').get(function () {
  const { impossibleTravel, suspiciousIp, unusualActivity } = this.fraudFlags || {};
  return impossibleTravel || suspiciousIp || unusualActivity;
});

// Static method to get user's login history
loginHistorySchema.statics.getUserLoginHistory = async function (userId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    flaggedOnly = false,
    sortBy = '-loginAt',
  } = options;

  const query = { userId };

  // Date range filter
  if (startDate || endDate) {
    query.loginAt = {};
    if (startDate) query.loginAt.$gte = new Date(startDate);
    if (endDate) query.loginAt.$lte = new Date(endDate);
  }

  // Filter for flagged logins only
  if (flaggedOnly) {
    query.$or = [
      { 'fraudFlags.impossibleTravel': true },
      { 'fraudFlags.suspiciousIp': true },
      { 'fraudFlags.unusualActivity': true },
    ];
  }

  const [results, total] = await Promise.all([
    this.find(query)
      .populate('deviceId', 'deviceInfo isTrusted')
      .sort(sortBy)
      .skip(offset)
      .limit(Math.min(limit, 200)) // Max 200 records
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    activity: results,
    pagination: {
      total,
      limit: Math.min(limit, 200),
      offset,
    },
  };
};

// Static method to get last successful login
loginHistorySchema.statics.getLastSuccessfulLogin = async function (userId, excludeCurrentSession = null) {
  const query = {
    userId,
    loginStatus: 'success',
  };

  // Exclude current session if provided
  if (excludeCurrentSession) {
    query.sessionId = { $ne: excludeCurrentSession };
  }

  return await this.findOne(query)
    .sort({ loginAt: -1 })
    .lean();
};

// Static method to get suspicious login count
loginHistorySchema.statics.getSuspiciousLoginCount = async function (userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return await this.countDocuments({
    userId,
    loginAt: { $gte: startDate },
    $or: [
      { 'fraudFlags.impossibleTravel': true },
      { 'fraudFlags.suspiciousIp': true },
      { 'fraudFlags.unusualActivity': true },
    ],
  });
};

// Static method to log a login attempt
loginHistorySchema.statics.logLogin = async function (loginData) {
  try {
    const log = new this(loginData);
    await log.save();
    return log;
  } catch (error) {
    console.error('Failed to log login history:', error);
    return null;
  }
};

// Instance method to mark notification as sent
loginHistorySchema.methods.markNotificationSent = async function () {
  this.notificationSent = true;
  return await this.save();
};

export default mongoose.model('LoginHistory', loginHistorySchema);
