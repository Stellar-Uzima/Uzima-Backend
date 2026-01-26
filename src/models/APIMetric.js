import mongoose from 'mongoose';

/**
 * API Metric Schema for comprehensive analytics tracking
 * Tracks all API requests with timing, status codes, and endpoint information
 * Optimized for time-series data aggregation and analysis
 */
const apiMetricSchema = new mongoose.Schema(
  {
    // Request identification
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Endpoint information
    endpoint: {
      type: String,
      required: true,
      index: true,
    },

    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      required: true,
      index: true,
    },

    // Request/Response metadata
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },

    // Timing information (in milliseconds)
    duration: {
      type: Number,
      required: true,
      index: true,
    },

    // Request details
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    ipAddress: {
      type: String,
      index: true,
      default: null,
    },

    // Request/Response size
    requestSize: {
      type: Number,
      default: null,
    },

    responseSize: {
      type: Number,
      default: null,
    },

    // Error tracking
    errorMessage: {
      type: String,
      default: null,
    },

    errorStack: {
      type: String,
      default: null,
    },

    // Query parameters (stored as string to avoid too large documents)
    queryString: {
      type: String,
      default: null,
    },

    // Response time breakdown
    dbTime: {
      type: Number,
      default: null,
    },

    cacheHit: {
      type: Boolean,
      default: false,
    },

    // Request classification
    isError: {
      type: Boolean,
      index: true,
      default: false,
    },

    is4xxError: {
      type: Boolean,
      index: true,
      default: false,
    },

    is5xxError: {
      type: Boolean,
      index: true,
      default: false,
    },

    // Performance classification
    isSlowQuery: {
      type: Boolean,
      index: true,
      default: false,
    },

    // Custom tags for filtering
    tags: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
    collection: 'apiMetrics',
    // TTL index for automatic cleanup after 90 days
    expireAfterSeconds: 7776000, // 90 days
  }
);

// Compound indexes for common queries
apiMetricSchema.index({ endpoint: 1, createdAt: -1 });
apiMetricSchema.index({ method: 1, statusCode: 1, createdAt: -1 });
apiMetricSchema.index({ statusCode: 1, createdAt: -1 });
apiMetricSchema.index({ userId: 1, createdAt: -1 });
apiMetricSchema.index({ isError: 1, createdAt: -1 });
apiMetricSchema.index({ is4xxError: 1, is5xxError: 1, createdAt: -1 });
apiMetricSchema.index({ isSlowQuery: 1, createdAt: -1 });

// Sparse index for userId (many records may not have a user)
apiMetricSchema.index({ userId: 1 }, { sparse: true });

// Time-series index for aggregations
apiMetricSchema.index({ createdAt: -1 });

/**
 * Static method to create a metric from request/response
 */
apiMetricSchema.statics.recordMetric = async function (
  {
    requestId,
    endpoint,
    method,
    statusCode,
    duration,
    userId = null,
    userAgent = null,
    ipAddress = null,
    requestSize = null,
    responseSize = null,
    errorMessage = null,
    errorStack = null,
    queryString = null,
    dbTime = null,
    cacheHit = false,
    tags = [],
  },
  session = null
) {
  const isError = statusCode >= 400;
  const is4xxError = statusCode >= 400 && statusCode < 500;
  const is5xxError = statusCode >= 500;
  const isSlowQuery = duration > 1000; // Configurable threshold

  const metric = new this({
    requestId,
    endpoint,
    method,
    statusCode,
    duration,
    userId,
    userAgent,
    ipAddress,
    requestSize,
    responseSize,
    errorMessage,
    errorStack,
    queryString,
    dbTime,
    cacheHit,
    isError,
    is4xxError,
    is5xxError,
    isSlowQuery,
    tags,
  });

  return session ? metric.save({ session }) : metric.save();
};

const APIMetric = mongoose.model('APIMetric', apiMetricSchema);

export default APIMetric;
