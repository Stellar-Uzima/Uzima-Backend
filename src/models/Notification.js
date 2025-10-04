import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['account_activation', 'password_reset', 'health_record_update', 'appointment_reminder', 'general'],
    required: true,
  },
  recipient: {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  subject: {
    type: String,
    required: true,
  },
  content: {
    html: String,
    text: String,
  },
  status: {
    type: String,
    enum: ['pending', 'queued', 'sent', 'failed', 'retrying'],
    default: 'pending',
  },
  provider: {
    type: String,
    enum: ['resend', 'logged'],
    default: 'resend',
  },
  metadata: {
    resendId: String,
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: Date,
    errorMessage: String,
    errorCode: String,
  },
  sentAt: Date,
  failedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
notificationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ 'recipient.email': 1 });
notificationSchema.index({ 'recipient.userId': 1 });
notificationSchema.index({ type: 1 });

export default mongoose.model('Notification', notificationSchema);
