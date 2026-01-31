/**
 * Unified Configuration Loader
 *
 * Dynamically loads environment-specific configuration based on NODE_ENV.
 * Validates all required environment variables using Joi.
 * Provides clean getter functions for accessing configuration values.
 *
 * @module config
 * @example
 * import { getConfig } from './config/index.js';
 *
 * const dbUri = getConfig().db.uri;
 * const port = getConfig().server.port;
 */

import Joi from 'joi';
import dotenv from 'dotenv';
import devConfig from './environments/dev.js';
import stagingConfig from './environments/staging.js';
import prodConfig from './environments/prod.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment configuration map
 */
const envConfigs = {
  development: devConfig,
  staging: stagingConfig,
  production: prodConfig,
};

/**
 * Get the current environment
 * @returns {string} Current environment (development, staging, or production)
 */
const getEnv = () => {
  const env = process.env.NODE_ENV || 'development';
  const validEnvs = ['development', 'staging', 'production'];

  if (!validEnvs.includes(env)) {
    // eslint-disable-next-line no-console
    console.warn(`Invalid NODE_ENV "${env}", defaulting to "development"`);
    return 'development';
  }

  return env;
};

/**
 * Joi validation schema for environment variables
 */
const envSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development')
    .description('Application environment'),

  PORT: Joi.number().port().default(5000).description('Server port'),

  // Database
  MONGO_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required()
    .description('MongoDB connection URI'),

  // Authentication
  JWT_SECRET: Joi.string().min(32).required().description('JWT signing secret (min 32 characters)'),

  // Email - SMTP (optional if using Resend)
  SMTP_HOST: Joi.string().hostname().description('SMTP server hostname'),

  SMTP_PORT: Joi.number().port().default(587).description('SMTP server port'),

  SMTP_USER: Joi.string().email().description('SMTP authentication username'),

  SMTP_PASS: Joi.string().description('SMTP authentication password'),

  MAIL_FROM: Joi.string()
    .default('Uzima Health <noreply@uzima.health>')
    .description('Email sender address'),

  // Email - Resend (optional)
  RESEND_API_KEY: Joi.string().pattern(/^re_/).description('Resend API key (starts with re_)'),

  // Redis
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379')
    .description('Redis connection URL'),

  // Email Queue
  EMAIL_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3)
    .description('Maximum email retry attempts'),

  EMAIL_BACKOFF_DELAY: Joi.number()
    .integer()
    .min(100)
    .default(2000)
    .description('Email retry backoff delay (ms)'),

  EMAIL_WORKER_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(5)
    .description('Email worker concurrency'),

  EMAIL_RATE_LIMIT_MAX: Joi.number()
    .integer()
    .min(1)
    .default(10)
    .description('Email rate limit max per duration'),

  EMAIL_RATE_LIMIT_DURATION: Joi.number()
    .integer()
    .min(100)
    .default(1000)
    .description('Email rate limit duration (ms)'),

  // AWS S3
  AWS_ACCESS_KEY_ID: Joi.string().description('AWS access key ID'),

  AWS_SECRET_ACCESS_KEY: Joi.string().description('AWS secret access key'),

  AWS_REGION: Joi.string().default('us-east-1').description('AWS region'),

  S3_BACKUP_BUCKET: Joi.string().description('S3 bucket for backups'),

  S3_BACKUP_PREFIX: Joi.string()
    .default('mongodb-backups/')
    .description('S3 prefix for backup files'),

  S3_BUCKET_NAME: Joi.string().description('S3 bucket for file uploads'),

  S3_ENDPOINT: Joi.string().uri().description('Custom S3 endpoint (for Minio)'),

  S3_FORCE_PATH_STYLE: Joi.boolean()
    .default(false)
    .description('Force path style for S3 (for Minio)'),

  // Backup
  BACKUP_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .default(30)
    .description('Number of days to retain backups'),

  BACKUP_ENCRYPTION_KEY: Joi.string()
    .min(32)
    .description('Encryption key for backups (min 32 characters)'),

  BACKUP_SCHEDULE: Joi.string().default('0 2 * * *').description('Cron schedule for backups'),

  BACKUP_STORAGE_LIMIT_GB: Joi.number()
    .integer()
    .min(1)
    .default(100)
    .description('Backup storage limit in GB'),

  // Monitoring
  SENTRY_DSN: Joi.string().uri().description('Sentry DSN for error tracking'),

  // Swagger
  SWAGGER_USER: Joi.string().default('admin').description('Swagger UI username'),

  SWAGGER_PASSWORD: Joi.string().min(8).default('changeme').description('Swagger UI password'),

  SWAGGER_ALLOWED_IPS: Joi.string()
    .default('127.0.0.1')
    .description('Comma-separated allowed IPs for Swagger'),

  // Stellar
  STELLAR_SECRET_KEY: Joi.string().description('Stellar secret key'),

  // Queue
  MAX_ATTEMPTS: Joi.number().integer().default(5).description('Maximum job retry attempts'),

  BACKOFF_BASE_MS: Joi.number().integer().default(1000).description('Job backoff base delay (ms)'),

  // GDPR
  STAGING_MONGO_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .description('Staging MongoDB URI for restore testing'),

  // Prescription
  PRESCRIPTION_SECRET: Joi.string().description('Prescription signing secret'),

  // ClamAV
  CLAMAV_API_URL: Joi.string().uri().description('ClamAV API URL for virus scanning'),

  REDIS_HOST: Joi.string()
    .hostname()
    .default('localhost')
    .description('Redis host (alternative to REDIS_URL)'),

  REDIS_PORT: Joi.number()
    .port()
    .default(6379)
    .description('Redis port (alternative to REDIS_URL)'),
  
  // MongoDB Connection Pool Configuration
  MONGO_MAX_POOL_SIZE: Joi.number()
    .integer()
    .min(5)
    .max(100)
    .default(25)
    .description('MongoDB max connection pool size'),
  
  MONGO_MIN_POOL_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(5)
    .description('MongoDB min connection pool size'),
  
  MONGO_MAX_IDLE_TIME_MS: Joi.number()
    .integer()
    .min(1000)
    .default(30000)
    .description('MongoDB max idle time before closing connection (ms)'),
  
  MONGO_CONNECT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000)
    .description('MongoDB connection timeout (ms)'),
  
  MONGO_SOCKET_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(120000)
    .default(30000)
    .description('MongoDB socket timeout for operations (ms)'),
  
  MONGO_WAIT_QUEUE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000)
    .description('MongoDB wait queue timeout (ms)'),
  
  MONGO_SERVER_SELECTION_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(120000)
    .default(30000)
    .description('MongoDB server selection timeout (ms)'),
  
  MONGO_RETRY_WRITES: Joi.boolean()
    .default(true)
    .description('Enable automatic retry of writes on transient errors'),
  
  MONGO_RETRY_READS: Joi.boolean()
    .default(true)
    .description('Enable automatic retry of reads on transient errors'),
  
  MONGO_CONNECTION_RETRY_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3)
    .description('Max attempts to connect to MongoDB on startup'),
  
  MONGO_CONNECTION_RETRY_INITIAL_DELAY_MS: Joi.number()
    .integer()
    .min(100)
    .max(10000)
    .default(1000)
    .description('Initial delay for connection retry backoff (ms)'),
})
  .unknown(true) // Allow other env vars
  .options({ abortEarly: false }); // Collect all errors

/**
 * Cached configuration object
 * @type {Object|null}
 */
let cachedConfig = null;

/**
 * Validate environment variables and build configuration
 * @throws {Error} If required environment variables are missing or invalid
 * @returns {Object} Validated and merged configuration
 */
const validateAndBuildConfig = () => {
  const env = getEnv();
  const envConfig = envConfigs[env];

  // Validate environment variables
  const { error, value: validatedEnv } = envSchema.validate(process.env, {
    stripUnknown: false,
  });

  if (error) {
    const errorMessages = error.details.map(detail => `  - ${detail.message}`).join('\n');

    // eslint-disable-next-line no-console
    console.error('\n╔══════════════════════════════════════════════════════════╗');
    // eslint-disable-next-line no-console
    console.error('║          ENVIRONMENT CONFIGURATION ERROR                   ║');
    // eslint-disable-next-line no-console
    console.error('╠══════════════════════════════════════════════════════════╣');
    // eslint-disable-next-line no-console
    console.error(`║  Environment: ${env.padEnd(43)}║`);
    // eslint-disable-next-line no-console
    console.error('╠══════════════════════════════════════════════════════════╣');
    // eslint-disable-next-line no-console
    console.error('║  The following configuration errors were found:           ║');
    // eslint-disable-next-line no-console
    console.error('╚══════════════════════════════════════════════════════════╝\n');
    // eslint-disable-next-line no-console
    console.error(errorMessages);
    // eslint-disable-next-line no-console
    console.error('\n📝 Please check your .env file and fix the above errors.\n');
    // eslint-disable-next-line no-console
    console.error('💡 See src/config/CONFIG.md for documentation.\n');

    throw new Error(`Configuration validation failed:\n${errorMessages}`);
  }

  // Build the final configuration object
  return {
    // Server configuration
    server: {
      env,
      port: validatedEnv.PORT || envConfig.server.port,
      logLevel: envConfig.server.logLevel,
    },

    // Database configuration
    db: {
      uri: validatedEnv.MONGO_URI,
      options: {
        ...envConfig.db.options,
        maxPoolSize: validatedEnv.MONGO_MAX_POOL_SIZE,
        minPoolSize: validatedEnv.MONGO_MIN_POOL_SIZE,
        maxIdleTimeMS: validatedEnv.MONGO_MAX_IDLE_TIME_MS,
        waitQueueTimeoutMS: validatedEnv.MONGO_WAIT_QUEUE_TIMEOUT_MS,
        connectTimeoutMS: validatedEnv.MONGO_CONNECT_TIMEOUT_MS,
        socketTimeoutMS: validatedEnv.MONGO_SOCKET_TIMEOUT_MS,
        serverSelectionTimeoutMS: validatedEnv.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        retryWrites: validatedEnv.MONGO_RETRY_WRITES,
        retryReads: validatedEnv.MONGO_RETRY_READS,
      },
      pool: {
        connectionRetryMaxAttempts: validatedEnv.MONGO_CONNECTION_RETRY_MAX_ATTEMPTS,
        connectionRetryInitialDelay: validatedEnv.MONGO_CONNECTION_RETRY_INITIAL_DELAY_MS,
      },
    },

    // JWT configuration
    jwt: {
      secret: validatedEnv.JWT_SECRET,
    },

    // Redis configuration
    redis: {
      url: validatedEnv.REDIS_URL || envConfig.redis?.url,
      host: validatedEnv.REDIS_HOST,
      port: validatedEnv.REDIS_PORT,
    },

    // Email configuration
    email: {
      smtp: {
        host: validatedEnv.SMTP_HOST,
        port: validatedEnv.SMTP_PORT,
        user: validatedEnv.SMTP_USER,
        pass: validatedEnv.SMTP_PASS,
      },
      from: validatedEnv.MAIL_FROM,
      resendApiKey: validatedEnv.RESEND_API_KEY,
      maxAttempts: validatedEnv.EMAIL_MAX_ATTEMPTS || envConfig.email.maxAttempts,
      backoffDelay: validatedEnv.EMAIL_BACKOFF_DELAY || envConfig.email.backoffDelay,
      workerConcurrency: validatedEnv.EMAIL_WORKER_CONCURRENCY || envConfig.email.workerConcurrency,
      rateLimitMax: validatedEnv.EMAIL_RATE_LIMIT_MAX || envConfig.email.rateLimitMax,
      rateLimitDuration:
        validatedEnv.EMAIL_RATE_LIMIT_DURATION || envConfig.email.rateLimitDuration,
    },

    // AWS configuration
    aws: {
      accessKeyId: validatedEnv.AWS_ACCESS_KEY_ID,
      secretAccessKey: validatedEnv.AWS_SECRET_ACCESS_KEY,
      region: validatedEnv.AWS_REGION,
      s3: {
        bucket: validatedEnv.S3_BUCKET_NAME,
        backupBucket: validatedEnv.S3_BACKUP_BUCKET,
        backupPrefix: validatedEnv.S3_BACKUP_PREFIX,
        endpoint: validatedEnv.S3_ENDPOINT,
        forcePathStyle: validatedEnv.S3_FORCE_PATH_STYLE,
      },
    },

    // Backup configuration
    backup: {
      retentionDays: validatedEnv.BACKUP_RETENTION_DAYS || envConfig.backup.retentionDays,
      encryptionKey: validatedEnv.BACKUP_ENCRYPTION_KEY,
      schedule: validatedEnv.BACKUP_SCHEDULE || envConfig.backup.schedule,
      storageLimitGb: validatedEnv.BACKUP_STORAGE_LIMIT_GB,
    },

    // Monitoring configuration
    monitoring: {
      sentryDsn: validatedEnv.SENTRY_DSN,
    },

    // Swagger configuration
    swagger: {
      user: validatedEnv.SWAGGER_USER,
      password: validatedEnv.SWAGGER_PASSWORD,
      allowedIps: validatedEnv.SWAGGER_ALLOWED_IPS?.split(',').map(ip => ip.trim()),
    },

    // Stellar configuration
    stellar: {
      secretKey: validatedEnv.STELLAR_SECRET_KEY,
    },

    // Queue configuration
    queue: {
      maxAttempts: validatedEnv.MAX_ATTEMPTS,
      backoffBaseMs: validatedEnv.BACKOFF_BASE_MS,
    },

    // GDPR configuration
    gdpr: {
      stagingMongoUri: validatedEnv.STAGING_MONGO_URI,
    },

    // Prescription configuration
    prescription: {
      secret: validatedEnv.PRESCRIPTION_SECRET || validatedEnv.JWT_SECRET,
    },

    // Scan configuration
    scan: {
      clamavApiUrl: validatedEnv.CLAMAV_API_URL,
    },

    // Feature flags from environment config
    features: envConfig.features,

    // Validation mode
    validation: envConfig.validation,
  };
};

/**
 * Initialize configuration
 * Call this early in application startup to validate env vars
 * @throws {Error} If validation fails
 */
export const initConfig = () => {
  if (!cachedConfig) {
    cachedConfig = validateAndBuildConfig();

    // Log successful initialization (non-sensitive info only)
    // eslint-disable-next-line no-console
    console.log(`\n✅ Configuration loaded for environment: ${cachedConfig.server.env}`);
    // eslint-disable-next-line no-console
    console.log(`   Server port: ${cachedConfig.server.port}`);
    // eslint-disable-next-line no-console
    console.log(`   Log level: ${cachedConfig.server.logLevel}\n`);
  }

  return cachedConfig;
};

/**
 * Get the current configuration
 * Initializes config if not already done
 *
 * @returns {Object} Configuration object
 * @example
 * const config = getConfig();
 * console.log(config.db.uri);
 * console.log(config.server.port);
 */
export const getConfig = () => {
  if (!cachedConfig) {
    return initConfig();
  }
  return cachedConfig;
};

/**
 * Check if running in development mode
 * @returns {boolean}
 */
export const isDevelopment = () => getConfig().server.env === 'development';

/**
 * Check if running in staging mode
 * @returns {boolean}
 */
export const isStaging = () => getConfig().server.env === 'staging';

/**
 * Check if running in production mode
 * @returns {boolean}
 */
export const isProduction = () => getConfig().server.env === 'production';

/**
 * Reset cached config (useful for testing)
 */
export const resetConfig = () => {
  cachedConfig = null;
};

// Default export for backward compatibility
export default { getConfig, initConfig, isDevelopment, isStaging, isProduction, resetConfig };
