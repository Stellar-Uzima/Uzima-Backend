import mongoose from 'mongoose';

const preferenceAuditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'reset', 'merge', 'delete'],
      index: true,
    },
    path: {
      type: String,
      description: 'Dot notation path for nested preferences (e.g., "notifications.email")',
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Previous value of the preference',
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      description: 'New value of the preference',
    },
    fullPreferences: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Complete preferences object after the change',
    },
    ipAddress: {
      type: String,
      description: 'IP address from which the change was made',
    },
    userAgent: {
      type: String,
      description: 'User agent string of the client',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sessionId: {
      type: String,
      description: 'Session ID for tracking user sessions',
    },
    reason: {
      type: String,
      description: 'Reason for the preference change',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Additional metadata about the change',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
preferenceAuditLogSchema.index({ userId: 1, timestamp: -1 });
preferenceAuditLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
preferenceAuditLogSchema.index({ userId: 1, path: 1, timestamp: -1 });

// Static method to log preference changes
preferenceAuditLogSchema.statics.logChange = async function (changeData) {
  try {
    const logEntry = new this(changeData);
    await logEntry.save();
    return logEntry;
  } catch (error) {
    console.error('Failed to log preference change:', error);
    throw error;
  }
};

// Static method to get user preference history
preferenceAuditLogSchema.statics.getUserHistory = async function (userId, options = {}) {
  const { page = 1, limit = 20, action, path, startDate, endDate } = options;

  const query = { userId };

  if (action) {
    query.action = action;
  }

  if (path) {
    query.path = path;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      query.timestamp.$gte = new Date(startDate);
    }
    if (endDate) {
      query.timestamp.$lte = new Date(endDate);
    }
  }

  const logs = await this.find(query)
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('performedBy', 'username email')
    .lean();

  const total = await this.countDocuments(query);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

// Static method to get preference statistics
preferenceAuditLogSchema.statics.getPreferenceStats = async function (userId, timeRange = '30d') {
  const startDate = new Date();

  switch (timeRange) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastChange: { $max: '$timestamp' },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  return stats;
};

// Instance method to get change summary
preferenceAuditLogSchema.methods.getSummary = function () {
  return {
    id: this._id,
    action: this.action,
    path: this.path,
    timestamp: this.timestamp,
    change: this.path
      ? `${this.path}: ${JSON.stringify(this.oldValue)} → ${JSON.stringify(this.newValue)}`
      : 'Full preferences update',
    performedBy: this.performedBy,
    reason: this.reason,
  };
};

export default mongoose.model('PreferenceAuditLog', preferenceAuditLogSchema);
