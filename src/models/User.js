/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import crypto from 'crypto';

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
    unique: true,
    trim: true,
    lowercase: true,
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
    requireTwoFactorForSensitive: { type: Boolean, default: false },
    passwordResetToken: String,
    passwordResetTokenExpires: Date,
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

userSchema.methods.createResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.security.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.security.passwordResetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken;
};

export default mongoose.model('User', userSchema);
