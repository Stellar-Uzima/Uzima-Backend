import mongoose from 'mongoose';

const gdprRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestType: {
      type: String,
      enum: ['export', 'delete'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // For export requests
    exportFormat: {
      type: String,
      enum: ['json', 'csv'],
      default: 'json',
    },
    exportData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    downloadUrl: {
      type: String,
      default: null,
    },
    // For delete requests
    deletionScheduledAt: {
      type: Date,
      default: null,
    },
    deletionCompletedAt: {
      type: Date,
      default: null,
    },
    // Audit fields
    requestReason: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    // Processing metadata
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingCompletedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    // Retention policy
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
gdprRequestSchema.index({ userId: 1, requestType: 1, status: 1 });
gdprRequestSchema.index({ status: 1, createdAt: -1 });
gdprRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware to set processing times
gdprRequestSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === 'processing' && !this.processingStartedAt) {
      this.processingStartedAt = new Date();
    } else if (this.status === 'completed' && !this.processingCompletedAt) {
      this.processingCompletedAt = new Date();
    }
  }
  next();
});

export default mongoose.model('GDPRRequest', gdprRequestSchema);
