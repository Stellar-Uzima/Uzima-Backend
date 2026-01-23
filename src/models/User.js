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
    required: true,
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

export default mongoose.model('User', userSchema);
