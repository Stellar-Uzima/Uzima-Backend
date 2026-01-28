/**
 * Production Environment Configuration
 * 
 * Strict settings for production deployment.
 * ALL secrets must be provided via environment variables.
 * No defaults for sensitive values.
 */

export default {
  // Environment identification
  env: 'production',
  
  // Server configuration
  server: {
    port: 5000,
    logLevel: 'warn',
  },
  
  // Database - no defaults
  db: {
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Pool configuration for production (larger pool, strict timeouts)
      maxPoolSize: 40,
      minPoolSize: 10,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 30000,
      retryWrites: true,
      retryReads: true,
    },
  },
  
  // Redis - no defaults, must be provided
  redis: {
    url: null,
  },
  
  // Email configuration
  email: {
    maxAttempts: 5,
    backoffDelay: 3000,
    workerConcurrency: 10,
    rateLimitMax: 20,
    rateLimitDuration: 1000,
  },
  
  // Backup configuration
  backup: {
    retentionDays: 90,
    schedule: '0 2 * * *',
  },
  
  // Feature flags
  features: {
    enableSwaggerAuth: true,
    enableDetailedErrors: false,
    enableStackTrace: false,
  },
  
  // Validation settings
  validation: {
    // Production requires all vars
    strictMode: true,
  },
};
