/**
 * Development Environment Configuration
 * 
 * Provides sensible defaults for local development.
 * All secrets still require .env file - no hardcoded values.
 */

export default {
  // Environment identification
  env: 'development',
  
  // Server configuration
  server: {
    port: 5000,
    logLevel: 'debug',
  },
  
  // Database defaults
  db: {
    // No default URI - must be provided via .env
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // Redis defaults
  redis: {
    url: 'redis://localhost:6379',
  },
  
  // Email configuration
  email: {
    maxAttempts: 3,
    backoffDelay: 2000,
    workerConcurrency: 5,
    rateLimitMax: 10,
    rateLimitDuration: 1000,
  },
  
  // Backup configuration
  backup: {
    retentionDays: 30,
    schedule: '0 2 * * *',
  },
  
  // Feature flags
  features: {
    enableSwaggerAuth: false,
    enableDetailedErrors: true,
    enableStackTrace: true,
  },
  
  // Validation settings
  validation: {
    // In development, some vars can have defaults
    strictMode: false,
  },
};
