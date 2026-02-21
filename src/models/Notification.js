import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  channel: {
    type: String,
    enum: ['email', 'sms', 'in-app', 'push'],
    default: 'email',
  },
  read: {
    type: Boolean,
    default: false,
  },
  recipient: {
    email: {
      type: String,
      required: false,
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
    required: false,
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
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ tenantId: 1, userId: 1 });
notificationSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model('Notification', notificationSchema);
