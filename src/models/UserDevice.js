import mongoose from 'mongoose';

const userDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fingerprint: {
      type: String,
      required: true,
    },
    fingerprintHash: {
      type: String,
      required: true,
      index: true,
    },
    deviceInfo: {
      userAgent: {
        type: String,
        required: false,
      },
      browser: {
        type: String,
        required: false,
      },
      os: {
        type: String,
        required: false,
      },
      device: {
        type: String,
        required: false,
      },
      screenResolution: {
        type: String,
        required: false,
      },
      timezone: {
        type: String,
        required: false,
      },
      language: {
        type: String,
        required: false,
      },
    },
    firstSeenAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    lastSeenLocation: {
      ip: String,
      country: String,
      city: String,
      region: String,
      latitude: Number,
      longitude: Number,
      timezone: String,
    },
    isTrusted: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    loginCount: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient querying
userDeviceSchema.index({ userId: 1, fingerprintHash: 1 }, { unique: true });
userDeviceSchema.index({ userId: 1, isActive: 1, lastSeenAt: -1 });
userDeviceSchema.index({ fingerprintHash: 1 });

// Virtual for device display name
userDeviceSchema.virtual('displayName').get(function () {
  const { browser, os, device } = this.deviceInfo;
  if (browser && os) {
    return `${browser} on ${os}`;
  }
  if (device) {
    return device;
  }
  return 'Unknown Device';
});

// Virtual for last seen location display
userDeviceSchema.virtual('locationDisplay').get(function () {
  const { city, country } = this.lastSeenLocation || {};
  if (city && country) {
    return `${city}, ${country}`;
  }
  if (country) {
    return country;
  }
  return 'Unknown Location';
});

// Static method to find device by fingerprint hash
userDeviceSchema.statics.findByFingerprint = async function (userId, fingerprintHash) {
  return await this.findOne({ userId, fingerprintHash, isActive: true });
};

// Static method to get user's active devices
userDeviceSchema.statics.getActiveDevices = async function (userId, options = {}) {
  const { limit = 10, offset = 0, sortBy = '-lastSeenAt' } = options;

  return await this.find({ userId, isActive: true }).sort(sortBy).skip(offset).limit(limit).lean();
};

// Instance method to update last seen
userDeviceSchema.methods.updateLastSeen = async function (location) {
  this.lastSeenAt = new Date();
  this.lastSeenLocation = location;
  this.loginCount += 1;
  return await this.save();
};

// Instance method to mark device as inactive
userDeviceSchema.methods.deactivate = async function () {
  this.isActive = false;
  return await this.save();
};

// Pre-save middleware to ensure required fields
userDeviceSchema.pre('save', function (next) {
  if (!this.fingerprintHash && this.fingerprint) {
    const crypto = require('crypto');
    this.fingerprintHash = crypto.createHash('sha256').update(this.fingerprint).digest('hex');
  }
  next();
});

export default mongoose.model('UserDevice', userDeviceSchema);
