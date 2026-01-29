import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  // User who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Action performed (e.g., 'login', 'logout', 'record_create', 'record_update', 'contract_interaction')
  action: {
    type: String,
    required: true,
    index: true,
    enum: [
      // Authentication actions
      'login',
      'logout',
      'login_failed',
      'password_reset_request',
      'password_reset_complete',
      'two_factor_enabled',
      'two_factor_disabled',
      'two_factor_verified',

      // Record actions
      'record_create',
      'record_update',
      'record_delete',
      'record_view',
      'record_download',
      'record_export',

      // User management actions
      'user_create',
      'user_update',
      'user_delete',
      'user_role_change',
      'user_status_change',

      // Contract/Blockchain actions
      'contract_interaction',
      'transaction_submit',
      'transaction_confirm',

      // File actions
      'file_upload',
      'file_download',
      'file_delete',
      'file_scan',

      // Admin actions
      'admin_access',
      'backup_create',
      'backup_restore',
      'system_config_change',

      // GDPR actions
      'gdpr_export_request',
      'gdpr_delete_request',
      'gdpr_data_export',
      'gdpr_data_deletion',

      // Inventory actions
      'inventory_create',
      'inventory_update',
      'inventory_adjust',
      'inventory_consume',

      // Prescription actions
      'prescription_create',
      'prescription_verify',
      'prescription_reject',
      'prescription_view',

      // Payment actions
      'payment_create',
      'payment_complete',
      'payment_failed',
      'payment_refund',

      // Generic actions
      'api_access',
      'data_access',
      'system_error'
    ]
  },

  // Additional context and metadata stored as JSON
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    validate: {
      validator: function(value) {
        // Ensure metadata is an object and not too large
        return typeof value === 'object' && JSON.stringify(value).length <= 10000;
      },
      message: 'Metadata must be an object and cannot exceed 10KB'
    }
  },

  // IP address of the user
  ipAddress: {
    type: String,
    required: false,
    index: true
  },

  // User agent string
  userAgent: {
    type: String,
    required: false
  },

  // Resource affected (e.g., record ID, user ID, file ID)
  resourceType: {
    type: String,
    required: false,
    index: true
  },

  resourceId: {
    type: String,
    required: false,
    index: true
  },

  // Result of the action
  result: {
    type: String,
    enum: ['success', 'failure', 'partial'],
    default: 'success',
    index: true
  },

  // Error message if action failed
  errorMessage: {
    type: String,
    required: false,
    maxlength: 1000
  },

  // Session ID for tracking user sessions
  sessionId: {
    type: String,
    required: false,
    index: true
  },

  // Request ID for correlation with other logs
  requestId: {
    type: String,
    required: false,
    index: true
  },

  // Duration of the action in milliseconds
  duration: {
    type: Number,
    required: false,
    min: 0
  },

  // Timestamp when the action occurred
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  // TTL for automatic cleanup (90 days by default)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient querying
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
activityLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
activityLogSchema.index({ result: 1, timestamp: -1 });
activityLogSchema.index({ sessionId: 1, timestamp: -1 });

// TTL index for automatic cleanup
activityLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for age calculation
activityLogSchema.virtual('age').get(function() {
  return Date.now() - this.timestamp;
});

// Virtual for formatted timestamp
activityLogSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toISOString();
});

// Static method to log an activity
activityLogSchema.statics.logActivity = async function(activityData) {
  try {
    const log = new this(activityData);
    await log.save();
    return log;
  } catch (error) {
    // Don't throw errors for logging failures to avoid breaking the main flow
    console.error('Failed to log activity:', error);
    return null;
  }
};

// Static method to get user activity summary
activityLogSchema.statics.getUserActivitySummary = async function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastOccurrence: { $max: '$timestamp' },
        successCount: {
          $sum: { $cond: [{ $eq: ['$result', 'success'] }, 1, 0] }
        },
        failureCount: {
          $sum: { $cond: [{ $eq: ['$result', 'failure'] }, 1, 0] }
        }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};



// Static method to get detailed action trends for analytics
activityLogSchema.statics.getActionTrendsOverTime = async function(startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $facet: {
        // Trend over time (daily)
        dailyTrend: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              count: { $sum: 1 },
              uniqueUsers: { $addToSet: '$userId' }
            }
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              date: '$_id',
              count: 1,
              activeUsers: { $size: '$uniqueUsers' },
              _id: 0
            }
          }
        ],
        // Breakdown by action type
        actionBreakdown: [
          {
            $group: {
              _id: '$action',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        // Top Active Users
        topUsers: [
          {
            $group: {
              _id: '$userId',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'userDetails'
            }
          },
          {
            $project: {
              userId: '$_id',
              count: 1,
              username: { $arrayElemAt: ['$userDetails.username', 0] },
              email: { $arrayElemAt: ['$userDetails.email', 0] }
            }
          }
        ]
      }
    }
  ]);
};

// Static method for Performance Analytics
activityLogSchema.statics.getPerformanceMetrics = async function(startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        duration: { $exists: true, $ne: null }
      }
    },
    {
      $facet: {
        // Overall stats
        overall: [
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$duration' },
              minDuration: { $min: '$duration' },
              maxDuration: { $max: '$duration' },
              totalRequests: { $sum: 1 }
            }
          }
        ],
        // Response time buckets/distribution
        distribution: [
          {
            $bucket: {
              groupBy: '$duration',
              boundaries: [0, 100, 500, 1000, 2000, 5000],
              default: '5000+',
              output: {
                count: { $sum: 1 }
              }
            }
          }
        ],
        // Slowest actions
        slowestActions: [
          {
            $group: {
              _id: '$action',
              avgDuration: { $avg: '$duration' },
              count: { $sum: 1 }
            }
          },
          { $sort: { avgDuration: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);
};

// Static method for Error Analytics
activityLogSchema.statics.getErrorAnalytics = async function(startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        // Match failures or errors
        $or: [
          { result: 'failure' },
          { action: { $regex: 'error', $options: 'i' } }
        ]
      }
    },
    {
      $facet: {
        // Errors over time
        trend: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        // Errors by type/action
        byAction: [
          {
            $group: {
              _id: '$action',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        // Top error messages (if available)
        topMessages: [
          {
            $match: { errorMessage: { $exists: true, $ne: null } }
          },
          {
            $group: {
              _id: '$errorMessage',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]
      }
    }
  ]);
};

// Static method to get activity statistics
activityLogSchema.statics.getActivityStats = async function(filters = {}) {
  const matchStage = {};

  if (filters.startDate) {
    matchStage.timestamp = { $gte: new Date(filters.startDate) };
  }
  if (filters.endDate) {
    matchStage.timestamp = { ...matchStage.timestamp, $lte: new Date(filters.endDate) };
  }
  if (filters.userId) {
    matchStage.userId = new mongoose.Types.ObjectId(filters.userId);
  }
  if (filters.action) {
    matchStage.action = filters.action;
  }

  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalActivities: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        successCount: {
          $sum: { $cond: [{ $eq: ['$result', 'success'] }, 1, 0] }
        },
        failureCount: {
          $sum: { $cond: [{ $eq: ['$result', 'failure'] }, 1, 0] }
        },
        avgDuration: { $avg: '$duration' },
        actionBreakdown: {
          $push: {
            action: '$action',
            result: '$result'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalActivities: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
        successCount: 1,
        failureCount: 1,
        successRate: {
          $cond: [
             { $eq: ['$totalActivities', 0] },
             0,
             {
               $multiply: [
                 { $divide: ['$successCount', '$totalActivities'] },
                 100
               ]
             }
          ]
        },
        avgDuration: { $round: ['$avgDuration', 2] }
      }
    }
  ]);
};


// Instance method to add additional metadata
activityLogSchema.methods.addMetadata = function(key, value) {
  if (!this.metadata) {
    this.metadata = {};
  }
  this.metadata[key] = value;
  return this.save();
};

// Pre-save middleware to validate and sanitize data
activityLogSchema.pre('save', function(next) {
  // Ensure metadata doesn't contain sensitive information
  if (this.metadata) {
    // Remove any potential password fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'hash'];
    sensitiveFields.forEach(field => {
      if (this.metadata[field]) {
        delete this.metadata[field];
      }
    });

    // Limit metadata size
    const metadataString = JSON.stringify(this.metadata);
    if (metadataString.length > 10000) {
      this.metadata = { error: 'Metadata too large, truncated' };
    }
  }

  next();
});

export default mongoose.model('ActivityLog', activityLogSchema);
