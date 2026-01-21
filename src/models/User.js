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

userSchema.plugin(encryptedFieldPlugin, { fields: ['email'] });

userSchema.methods.createResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.security.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.security.passwordResetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken;
};

export default mongoose.model('User', userSchema);