/**
 * Staging Environment Configuration
 * 
 * Mirrors production settings but may use test endpoints.
 * All secrets must be provided via environment variables.
 */

export default {
  // Environment identification
  env: 'staging',
  
  // Server configuration
  server: {
    port: 5000,
    logLevel: 'info',
  },
  
  // Database defaults
  db: {
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // Redis - no defaults, must be provided
  redis: {
    url: null,
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
    enableSwaggerAuth: true,
    enableDetailedErrors: false,
    enableStackTrace: false,
  },
  
  // Validation settings
  validation: {
    // Staging requires most production vars
    strictMode: true,
  },
};
