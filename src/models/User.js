/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
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
  // 2FA Configuration
  twoFactorAuth: {
    isEnabled: {
      type: Boolean,
      default: false,
    },
    methods: {
      sms: {
        enabled: { type: Boolean, default: false },
        phoneNumber: { type: String },
        verified: { type: Boolean, default: false },
      },
      totp: {
        enabled: { type: Boolean, default: false },
        secret: { type: String }, // Encrypted TOTP secret
        verified: { type: Boolean, default: false },
        backupCodes: [
          {
            code: String,
            used: { type: Boolean, default: false },
            usedAt: Date,
          },
        ],
      },
    },
    // Remember device tokens
    trustedDevices: [
      {
        deviceId: String,
        deviceInfo: String,
        ipAddress: String,
        userAgent: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: {
          type: Date,
          default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        revoked: { type: Boolean, default: false },
      },
    ],
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
