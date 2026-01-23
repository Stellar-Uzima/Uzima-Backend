/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import crypto from 'crypto';
import encryptedFieldPlugin from './plugins/encryptedField.js';

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

userSchema.methods.createResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.security.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.security.passwordResetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken;
};

export default mongoose.model('User', userSchema);
