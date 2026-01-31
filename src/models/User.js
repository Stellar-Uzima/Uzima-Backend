/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import crypto from 'crypto';
import encryptedFieldPlugin from './plugins/encryptedField.js';

const userSchema = new mongoose.Schema({
  // User preferences for notifications, UI, language, etc.
  preferences: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      notifications: {
        email: true,
        push: true,
        sms: false,
        marketing: false,
        appointments: true,
        prescriptions: true,
        labResults: true,
      },
      ui: {
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
      },
      privacy: {
        profileVisibility: 'public',
        shareData: true,
        analytics: true,
      },
      accessibility: {
        fontSize: 'medium',
        highContrast: false,
        screenReader: false,
      },
    },
  },
  // User preference for personalized recommendations
  recommendationsOptOut: {
    type: Boolean,
    default: false,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    // unique constraint moved to email_hash
    trim: true,
    lowercase: true,
  },
  email_hash: {
    type: String,
    unique: true,
  },
  password: {
    type: String,
    required: function () {
      // Password is required unless user has OAuth accounts
      return !this.oauthAccounts || Object.keys(this.oauthAccounts).length === 0;
    },
  },
  // OAuth accounts for social login
  oauthAccounts: {
    google: {
      id: String,
      email: String,
      name: String,
      avatar: String,
      accessToken: String,
      refreshToken: String,
      linkedAt: {
        type: Date,
        default: Date.now
      }
    },
    github: {
      id: String,
      username: String,
      email: String,
      name: String,
      avatar: String,
      accessToken: String,
      refreshToken: String,
      linkedAt: {
        type: Date,
        default: Date.now
      }
    },
    microsoft: {
      id: String,
      email: String,
      name: String,
      avatar: String,
      accessToken: String,
      refreshToken: String,
      linkedAt: {
        type: Date,
        default: Date.now
      }
    }
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'educator', 'admin'],
    required: true,
  },
  // Security settings
  security: {
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    passwordChangedAt: Date,
    passwordExpiresAt: Date,
    requirePasswordChange: { type: Boolean, default: false },
    requireTwoFactorForSensitive: { type: Boolean, default: false },
    passwordResetToken: String,
    passwordResetTokenExpires: Date,
    // Password history - stores last 5 password hashes
    passwordHistory: [{
      hash: String,
      changedAt: { type: Date, default: Date.now },
    }],
    twoFactorCode: String,
    twoFactorCodeExpires: Date,
  },
  phoneNumber: {
    type: String,
    sparse: true,
    unique: true,
    trim: true,
  },
  isPhoneVerified: {
    type: Boolean,
    default: false,
  },
  twoFactorMethod: {
    type: String,
    enum: ['sms', 'totp', null],
    default: null,
  },
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secret: { type: String }, // Encrypted TOTP secret
    algorithm: { type: String, default: 'sha1' },
    encoding: { type: String, default: 'base32' },
    verifiedAt: { type: Date },
    backupCodes: [
      {
        code: { type: String }, // Hashed with bcrypt
        usedAt: { type: Date },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
});

userSchema.index({ email: 1, deletedAt: 1 });
userSchema.index({ username: 1, deletedAt: 1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });

// Static method for registration trends
userSchema.statics.getRegistrationTrends = async function (startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
};

// Static method for active user count (based on last login or activity if available)
// Since we don't have a lastLogin field in the schema show earlier, we'll try to use available fields
// Note: Ideally ActivityLog should be used for "active users", but this method counts valid non-deleted users
userSchema.statics.getTotalUserCount = async function (endDate) {
  // If endDate is provided, count users created before that date
  const query = { deletedAt: null };
  if (endDate) {
    query.createdAt = { $lte: endDate };
  }
  return await this.countDocuments(query);
};

// Static method for role distribution
userSchema.statics.getRoleDistribution = async function () {
  return await this.aggregate([
    {
      $match: { deletedAt: null }
    },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
      },
    },
  ]);
};

userSchema.plugin(encryptedFieldPlugin, { fields: ['email'] });
// Compound indexes for optimal query performance
userSchema.index({ email: 1, deletedAt: 1 });
userSchema.index({ username: 1, deletedAt: 1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });


userSchema.methods.createResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.security.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.security.passwordResetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken;
};

// OAuth helper methods
userSchema.methods.linkOAuthAccount = function (provider, profileData) {
  if (!this.oauthAccounts) {
    this.oauthAccounts = {};
  }

  this.oauthAccounts[provider] = {
    ...profileData,
    linkedAt: new Date()
  };

  return this.save();
};

userSchema.methods.unlinkOAuthAccount = function (provider) {
  if (this.oauthAccounts && this.oauthAccounts[provider]) {
    delete this.oauthAccounts[provider];

    // If user has no password and no other OAuth accounts, they need to set a password
    if (!this.password && Object.keys(this.oauthAccounts).length === 0) {
      throw new Error('Cannot unlink last authentication method. Please set a password first.');
    }

    return this.save();
  }
  throw new Error(`OAuth account for ${provider} not found`);
};

userSchema.methods.getOAuthProviders = function () {
  const providers = [];
  if (this.oauthAccounts) {
    Object.keys(this.oauthAccounts).forEach(provider => {
      if (this.oauthAccounts[provider]) {
        providers.push({
          provider,
          email: this.oauthAccounts[provider].email,
          name: this.oauthAccounts[provider].name,
          linkedAt: this.oauthAccounts[provider].linkedAt
        });
      }
    });
  }
  return providers;
};

userSchema.methods.hasOAuthProvider = function (provider) {
  return this.oauthAccounts && this.oauthAccounts[provider] && this.oauthAccounts[provider].id;
};

userSchema.methods.isOAuthUser = function () {
  return this.oauthAccounts && Object.keys(this.oauthAccounts).length > 0;
};

// Static method to find user by OAuth provider and ID
userSchema.statics.findByOAuthProvider = function (provider, id) {
  const query = {};
  query[`oauthAccounts.${provider}.id`] = id;
  return this.findOne(query);
};

// Static method to find user by OAuth email
userSchema.statics.findByOAuthEmail = function (provider, email) {
  const query = {};
  query[`oauthAccounts.${provider}.email`] = email;
  return this.findOne(query);
};

export default mongoose.model('User', userSchema);
